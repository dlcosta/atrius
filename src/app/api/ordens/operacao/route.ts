import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calcularDuracao, calcularFim } from '@/lib/planning/engine'
import { mapearVolumeReferenciaPorOrdem, obterVolumeReferenciaLitros } from '@/lib/ordens/volume'
import { buscarOperadorPorId } from '@/lib/operators/store'
import type { EtapaOrdem, FlowSource, PlanningStatus } from '@/types'

type AcaoOperacao = 'iniciar' | 'pausar' | 'retomar' | 'finalizar'
type ResourceType = 'machine' | 'tank'
type SourceTable = 'ordens' | 'ordens_tanque_novo_fluxo' | 'ordens_envase_novo_fluxo'

type OrdemVolumeLinha = {
  id: string
  quantidade: number
  unidade: string | null
  lote: string | null
  etapa: EtapaOrdem | null
}

type ProdutoTempos = {
  volume_base: number
  tempos_maquinas: Record<string, { setup?: number; producao?: number }>
}

type CompatOperacaoState = {
  inicio_operacao_em?: string | null
  fim_operacao_em?: string | null
  pausado_em?: string | null
  tempo_restante_pausado_seg?: number | null
  operador_id?: string | null
  operador_nome?: string | null
  observacao_pausa?: string | null
}

type CompatNotesPayload = {
  legacy_text?: string | null
  operacao?: CompatOperacaoState | null
}

type OrdemOperacao = {
  id: string
  numero_externo: string
  etapa: EtapaOrdem | null
  produto_sku: string | null
  maquina_id: string | null
  tank_id: string | null
  status: string
  planning_status: PlanningStatus | null
  inicio_operacao_em: string | null
  fim_operacao_em: string | null
  inicio_agendado: string | null
  fim_calculado: string | null
  pausado_em: string | null
  tempo_restante_pausado_seg: number | null
  operador_id?: string | null
  operador_nome: string | null
  observacao_pausa?: string | null
  quantidade: number
  unidade: string | null
  lote: string | null
  total_duration_minutes: number | null
  origin_tank_order_id: string | null
  origin_tank_source?: 'novo_fluxo' | 'legado' | null
  notes?: string | null
  produto?: ProdutoTempos | null
}

type LegacyOrderRow = Omit<OrdemOperacao, 'produto' | 'origin_tank_source'> & {
  produto?: ProdutoTempos | ProdutoTempos[] | null
}

type NewOrderRow = {
  id: string
  numero_externo: string
  etapa: EtapaOrdem | null
  produto_sku: string | null
  maquina_id?: string | null
  tank_id?: string | null
  status: string
  planning_status: PlanningStatus | null
  inicio_agendado: string | null
  fim_calculado: string | null
  quantidade: number
  unidade: string | null
  lote: string | null
  total_duration_minutes: number | null
  origin_tank_order_id?: string | null
  origin_tank_source?: 'novo_fluxo' | 'legado' | null
  notes?: string | null
}

type PostBody = {
  ordem_id?: string
  acao?: unknown
  operador_id?: string
  operador_nome?: string
  observacao_pausa?: string
  flow_source?: FlowSource
}

type OrderResolution = {
  ordem: OrdemOperacao
  source: FlowSource
  table: SourceTable
  isLegacy: boolean
}

function validarAcao(valor: unknown): valor is AcaoOperacao {
  return valor === 'iniciar' || valor === 'pausar' || valor === 'retomar' || valor === 'finalizar'
}

function validarSource(valor: unknown): valor is FlowSource {
  return valor === 'legado' || valor === 'novo_fluxo_tanque' || valor === 'novo_fluxo_envase'
}

function isFinalized(status: string | null, planningStatus: PlanningStatus | null): boolean {
  return status === 'concluida' || planningStatus === 'COMPLETED'
}

function isCanceled(status: string | null, planningStatus: PlanningStatus | null): boolean {
  return status === 'cancelada' || planningStatus === 'CANCELED'
}

function isPaused(status: string | null, planningStatus: PlanningStatus | null): boolean {
  return status === 'pausada' || planningStatus === 'PAUSED'
}

function isInProduction(status: string | null, planningStatus: PlanningStatus | null): boolean {
  return status === 'produzindo' || planningStatus === 'IN_PRODUCTION'
}

function minutosEntre(inicioIso: string | null, fimIso: string | null): number | null {
  if (!inicioIso || !fimIso) return null
  const inicioMs = new Date(inicioIso).getTime()
  const fimMs = new Date(fimIso).getTime()
  if (!Number.isFinite(inicioMs) || !Number.isFinite(fimMs)) return null
  const diff = (fimMs - inicioMs) / 60000
  return diff > 0 ? diff : null
}

function resourceForOrder(ordem: OrdemOperacao): { type: ResourceType; id: string | null } {
  if (ordem.etapa === 'tanque') return { type: 'tank', id: ordem.tank_id }
  return { type: 'machine', id: ordem.maquina_id }
}

function buildEndFromRemaining(nowIso: string, remainingSeconds: number): string {
  const now = new Date(nowIso)
  return new Date(now.getTime() + remainingSeconds * 1000).toISOString()
}

function calcularSegundosRestantes(ordem: OrdemOperacao, agoraIso: string): number {
  if (ordem.tempo_restante_pausado_seg && ordem.tempo_restante_pausado_seg > 0) {
    return ordem.tempo_restante_pausado_seg
  }

  if (ordem.fim_calculado) {
    const diff = Math.ceil((new Date(ordem.fim_calculado).getTime() - new Date(agoraIso).getTime()) / 1000)
    if (Number.isFinite(diff) && diff > 0) return diff
  }

  const fallbackMinutes = Math.max(1, Number(ordem.total_duration_minutes || 1))
  return fallbackMinutes * 60
}

function parseCompatNotes(notes: string | null | undefined): CompatNotesPayload {
  if (!notes) return {}

  try {
    const parsed = JSON.parse(notes) as CompatNotesPayload
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    return { legacy_text: notes }
  }

  return {}
}

function mergeCompatNotes(notes: string | null | undefined, operacao: CompatOperacaoState): string {
  const atual = parseCompatNotes(notes)
  const payload: CompatNotesPayload = {
    ...atual,
    operacao: {
      ...(atual.operacao ?? {}),
      ...operacao,
    },
  }

  return JSON.stringify(payload)
}

function hydrateOperationalState<T extends NewOrderRow>(row: T): OrdemOperacao {
  const compat = parseCompatNotes(row.notes)
  const operacao = compat.operacao ?? {}

  return {
    ...row,
    maquina_id: row.maquina_id ?? null,
    tank_id: row.tank_id ?? null,
    inicio_operacao_em: operacao.inicio_operacao_em ?? null,
    fim_operacao_em: operacao.fim_operacao_em ?? null,
    pausado_em: operacao.pausado_em ?? null,
    tempo_restante_pausado_seg: operacao.tempo_restante_pausado_seg ?? null,
    operador_id: operacao.operador_id ?? null,
    operador_nome: operacao.operador_nome ?? null,
    observacao_pausa: operacao.observacao_pausa ?? null,
    origin_tank_order_id: row.origin_tank_order_id ?? null,
    origin_tank_source: row.origin_tank_source ?? null,
    produto: null,
  }
}

async function resolverOperador(payload: PostBody) {
  const operadorId = payload.operador_id?.trim() ?? ''
  const operadorNomeDigitado = payload.operador_nome?.trim() ?? ''

  if (operadorId) {
    const operador = await buscarOperadorPorId(operadorId)
    if (!operador || !operador.ativo) {
      return { error: 'Operador selecionado nao esta disponivel.' as const }
    }
    return { operadorId: operador.id, operadorNome: operador.nome }
  }

  if (!operadorNomeDigitado) {
    return { error: 'operador_id obrigatorio' as const }
  }

  return { operadorId: null, operadorNome: operadorNomeDigitado }
}

async function calcularDuracaoPlanejadaMinLegado(
  supabase: ReturnType<typeof createServiceClient>,
  ordem: OrdemOperacao
): Promise<number> {
  const duracaoDaAgenda = minutosEntre(ordem.inicio_agendado, ordem.fim_calculado)
  if (duracaoDaAgenda) return duracaoDaAgenda
  if (ordem.total_duration_minutes && ordem.total_duration_minutes > 0) return ordem.total_duration_minutes
  if (!ordem.maquina_id || !ordem.produto) return 1

  let volumeReferencia = Number(ordem.quantidade || 0)

  if (ordem.lote) {
    const { data: ordensLote } = await supabase
      .from('ordens')
      .select('id, quantidade, unidade, lote, etapa')
      .eq('lote', ordem.lote)

    if (Array.isArray(ordensLote) && ordensLote.length > 0) {
      const map = mapearVolumeReferenciaPorOrdem(ordensLote as OrdemVolumeLinha[])
      volumeReferencia = obterVolumeReferenciaLitros(
        {
          id: ordem.id,
          quantidade: Number(ordem.quantidade || 0),
          unidade: ordem.unidade,
          lote: ordem.lote,
          etapa: ordem.etapa,
        },
        map
      )
    }
  }

  const tempos = ordem.produto.tempos_maquinas?.[ordem.maquina_id] || {}
  const setup = Number(tempos.setup ?? 0)
  const producao = Number(tempos.producao ?? 0)
  const calculado = calcularDuracao(volumeReferencia, Number(ordem.produto.volume_base || 3800), setup, producao)
  return calculado > 0 ? calculado : 1
}

async function loadLegacyOrder(supabase: ReturnType<typeof createServiceClient>, ordemId: string) {
  const { data } = await supabase
    .from('ordens')
    .select(
      'id, numero_externo, etapa, produto_sku, maquina_id, tank_id, status, planning_status, inicio_operacao_em, fim_operacao_em, inicio_agendado, fim_calculado, pausado_em, tempo_restante_pausado_seg, operador_nome, quantidade, unidade, lote, total_duration_minutes, origin_tank_order_id, notes, produto:produtos(volume_base, tempos_maquinas)'
    )
    .eq('id', ordemId)
    .maybeSingle()

  if (!data) return null

  const raw = data as unknown as LegacyOrderRow
  const compat = parseCompatNotes(raw.notes)
  const operacao = compat.operacao ?? {}

  return {
    ...raw,
    operador_id: operacao.operador_id ?? null,
    observacao_pausa: operacao.observacao_pausa ?? null,
    produto: Array.isArray(raw.produto) ? (raw.produto[0] ?? null) : (raw.produto ?? null),
  } as OrdemOperacao
}

async function loadNewTankOrder(supabase: ReturnType<typeof createServiceClient>, ordemId: string) {
  const { data } = await supabase
    .from('ordens_tanque_novo_fluxo')
    .select(
      'id, numero_externo, etapa, produto_sku, tank_id, status, planning_status, inicio_agendado, fim_calculado, quantidade, unidade, lote, total_duration_minutes, notes'
    )
    .eq('id', ordemId)
    .maybeSingle()

  if (!data) return null
  return hydrateOperationalState({
    ...(data as NewOrderRow),
    maquina_id: null,
    origin_tank_order_id: null,
  })
}

async function loadNewEnvaseOrder(supabase: ReturnType<typeof createServiceClient>, ordemId: string) {
  const { data } = await supabase
    .from('ordens_envase_novo_fluxo')
    .select(
      'id, numero_externo, etapa, produto_sku, maquina_id, status, planning_status, inicio_agendado, fim_calculado, quantidade, unidade, lote, total_duration_minutes, origin_tank_order_id, origin_tank_source, notes'
    )
    .eq('id', ordemId)
    .maybeSingle()

  if (!data) return null
  return hydrateOperationalState({
    ...(data as NewOrderRow),
    tank_id: null,
  })
}

async function resolveOrder(
  supabase: ReturnType<typeof createServiceClient>,
  ordemId: string,
  source?: FlowSource
): Promise<OrderResolution | null> {
  if (source === 'legado') {
    const ordem = await loadLegacyOrder(supabase, ordemId)
    return ordem ? { ordem, source: 'legado', table: 'ordens', isLegacy: true } : null
  }

  if (source === 'novo_fluxo_tanque') {
    const ordem = await loadNewTankOrder(supabase, ordemId)
    return ordem ? { ordem, source: 'novo_fluxo_tanque', table: 'ordens_tanque_novo_fluxo', isLegacy: false } : null
  }

  if (source === 'novo_fluxo_envase') {
    const ordem = await loadNewEnvaseOrder(supabase, ordemId)
    return ordem ? { ordem, source: 'novo_fluxo_envase', table: 'ordens_envase_novo_fluxo', isLegacy: false } : null
  }

  const legado = await loadLegacyOrder(supabase, ordemId)
  if (legado) return { ordem: legado, source: 'legado', table: 'ordens', isLegacy: true }

  const novoTanque = await loadNewTankOrder(supabase, ordemId)
  if (novoTanque) return { ordem: novoTanque, source: 'novo_fluxo_tanque', table: 'ordens_tanque_novo_fluxo', isLegacy: false }

  const novoEnvase = await loadNewEnvaseOrder(supabase, ordemId)
  if (novoEnvase) return { ordem: novoEnvase, source: 'novo_fluxo_envase', table: 'ordens_envase_novo_fluxo', isLegacy: false }

  return null
}

async function hasOperationalConflictOnResource(
  supabase: ReturnType<typeof createServiceClient>,
  resourceType: ResourceType,
  resourceId: string,
  currentId: string,
  currentSource: FlowSource
) {
  const activeStatuses = ['IN_PRODUCTION', 'PAUSED']

  if (resourceType === 'machine') {
    const [{ data: legacy }, { data: novo }] = await Promise.all([
      supabase
        .from('ordens')
        .select('id')
        .eq('etapa', 'envase')
        .eq('maquina_id', resourceId)
        .in('planning_status', activeStatuses),
      supabase
        .from('ordens_envase_novo_fluxo')
        .select('id')
        .eq('maquina_id', resourceId)
        .in('planning_status', activeStatuses),
    ])

    const legacyConflict = (legacy ?? []).some((row) => !(currentSource === 'legado' && row.id === currentId))
    const novoConflict = (novo ?? []).some((row) => !(currentSource === 'novo_fluxo_envase' && row.id === currentId))
    return legacyConflict || novoConflict
  }

  const [{ data: legacy }, { data: novo }] = await Promise.all([
    supabase
      .from('ordens')
      .select('id')
      .eq('etapa', 'tanque')
      .eq('tank_id', resourceId)
      .in('planning_status', activeStatuses),
    supabase
      .from('ordens_tanque_novo_fluxo')
      .select('id')
      .eq('tank_id', resourceId)
      .in('planning_status', activeStatuses),
  ])

  const legacyConflict = (legacy ?? []).some((row) => !(currentSource === 'legado' && row.id === currentId))
  const novoConflict = (novo ?? []).some((row) => !(currentSource === 'novo_fluxo_tanque' && row.id === currentId))
  return legacyConflict || novoConflict
}

async function validarOrigemTanqueConcluida(
  supabase: ReturnType<typeof createServiceClient>,
  resolution: OrderResolution
) {
  const { ordem, source } = resolution
  if (ordem.etapa !== 'envase' || !ordem.origin_tank_order_id) return null

  if (source === 'novo_fluxo_envase' && ordem.origin_tank_source === 'novo_fluxo') {
    const { data } = await supabase
      .from('ordens_tanque_novo_fluxo')
      .select('planning_status, status')
      .eq('id', ordem.origin_tank_order_id)
      .maybeSingle()

    if (!data) return 'Ordem de tanque de origem nao encontrada.'
    if (data.status === 'cancelada' || data.planning_status === 'CANCELED') return 'Ordem de tanque cancelada nao pode liberar envase.'
    if (data.planning_status !== 'COMPLETED') return 'So e possivel iniciar o envase quando a ordem do tanque estiver concluida.'
    return null
  }

  const { data } = await supabase
    .from('ordens')
    .select('planning_status, status')
    .eq('id', ordem.origin_tank_order_id)
    .maybeSingle()

  if (!data) return 'Ordem de tanque de origem nao encontrada.'
  if (data.status === 'cancelada' || data.planning_status === 'CANCELED') return 'Ordem de tanque cancelada nao pode liberar envase.'
  if (data.planning_status !== 'COMPLETED') return 'So e possivel iniciar o envase quando a ordem do tanque estiver concluida.'
  return null
}

async function updateOrder(
  supabase: ReturnType<typeof createServiceClient>,
  resolution: OrderResolution,
  updates: Record<string, unknown>
) {
  const compatOperacao: CompatOperacaoState = {
    inicio_operacao_em:
      typeof updates.inicio_operacao_em === 'string'
        ? updates.inicio_operacao_em
        : resolution.ordem.inicio_operacao_em ?? null,
    fim_operacao_em:
      typeof updates.fim_operacao_em === 'string'
        ? updates.fim_operacao_em
        : updates.fim_operacao_em === null
          ? null
          : resolution.ordem.fim_operacao_em ?? null,
    pausado_em:
      typeof updates.pausado_em === 'string'
        ? updates.pausado_em
        : updates.pausado_em === null
          ? null
          : resolution.ordem.pausado_em ?? null,
    tempo_restante_pausado_seg:
      typeof updates.tempo_restante_pausado_seg === 'number'
        ? updates.tempo_restante_pausado_seg
        : updates.tempo_restante_pausado_seg === null
          ? null
          : resolution.ordem.tempo_restante_pausado_seg ?? null,
    operador_id:
      typeof updates.operador_id === 'string'
        ? updates.operador_id
        : updates.operador_id === null
          ? null
          : resolution.ordem.operador_id ?? null,
    operador_nome:
      typeof updates.operador_nome === 'string'
        ? updates.operador_nome
        : resolution.ordem.operador_nome ?? null,
    observacao_pausa:
      typeof updates.observacao_pausa === 'string'
        ? updates.observacao_pausa
        : updates.observacao_pausa === null
          ? null
          : resolution.ordem.observacao_pausa ?? null,
  }

  if (!resolution.isLegacy) {
    const compatUpdates: Record<string, unknown> = {
      status: updates.status,
      planning_status: updates.planning_status,
      fim_calculado: updates.fim_calculado ?? resolution.ordem.fim_calculado,
      notes: mergeCompatNotes(resolution.ordem.notes, compatOperacao),
    }

    const { data, error } = await supabase
      .from(resolution.table)
      .update(compatUpdates)
      .eq('id', resolution.ordem.id)
      .select('*')
      .single()

    if (error || !data) {
      return { error: error?.message ?? 'Erro ao atualizar ordem', data: null }
    }

    const hydrated = resolution.source === 'novo_fluxo_tanque'
      ? hydrateOperationalState({
          ...(data as NewOrderRow),
          maquina_id: null,
          origin_tank_order_id: null,
        })
      : hydrateOperationalState({
          ...(data as NewOrderRow),
          tank_id: null,
        })

    return { error: null, data: hydrated }
  }

  const legacyUpdates: Record<string, unknown> = { ...updates }
  delete legacyUpdates.operador_id
  delete legacyUpdates.observacao_pausa
  legacyUpdates.notes = mergeCompatNotes(resolution.ordem.notes, compatOperacao)

  const { data, error } = await supabase
    .from(resolution.table)
    .update(legacyUpdates)
    .eq('id', resolution.ordem.id)
    .select('*')
    .single()

  if (error || !data) {
    return { error: error?.message ?? 'Erro ao atualizar ordem', data: null }
  }

  return { error: null, data }
}

async function registrarEventoLegado(
  supabase: ReturnType<typeof createServiceClient>,
  ordem: OrdemOperacao,
  tipo: 'inicio' | 'pausa' | 'retomada' | 'conclusao',
  timestamp: string,
  operadorNome: string
) {
  await supabase.from('eventos_timer').insert({
    ordem_id: ordem.id,
    maquina_id: ordem.maquina_id,
    tipo,
    timestamp,
    operador_nome: operadorNome,
  })
}

async function liberarEnvasesAguardando(
  supabase: ReturnType<typeof createServiceClient>,
  resolution: OrderResolution
) {
  if (resolution.ordem.etapa !== 'tanque') return

  if (resolution.source === 'legado') {
    await Promise.all([
      supabase
        .from('ordens')
        .update({ planning_status: 'SCHEDULED' })
        .eq('origin_tank_order_id', resolution.ordem.id)
        .eq('etapa', 'envase')
        .eq('planning_status', 'WAITING_TANK'),
      supabase
        .from('ordens_envase_novo_fluxo')
        .update({ planning_status: 'SCHEDULED' })
        .eq('origin_tank_source', 'legado')
        .eq('origin_tank_order_id', resolution.ordem.id)
        .eq('planning_status', 'WAITING_TANK'),
    ])
    return
  }

  if (resolution.source === 'novo_fluxo_tanque') {
    await supabase
      .from('ordens_envase_novo_fluxo')
      .update({ planning_status: 'SCHEDULED' })
      .eq('origin_tank_source', 'novo_fluxo')
      .eq('origin_tank_order_id', resolution.ordem.id)
      .eq('planning_status', 'WAITING_TANK')
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const body = (await req.json()) as PostBody

  const ordemId = body.ordem_id?.trim()
  const acao = body.acao
  const observacaoPausa = body.observacao_pausa?.trim() ?? ''
  const requestedSource = validarSource(body.flow_source) ? body.flow_source : undefined

  if (!ordemId) {
    return NextResponse.json({ error: 'ordem_id obrigatorio' }, { status: 422 })
  }
  if (!validarAcao(acao)) {
    return NextResponse.json({ error: 'acao invalida' }, { status: 422 })
  }
  const operadorResolvido = await resolverOperador(body)
  if ('error' in operadorResolvido) {
    return NextResponse.json({ error: operadorResolvido.error }, { status: 422 })
  }
  if (acao === 'pausar' && !observacaoPausa) {
    return NextResponse.json({ error: 'observacao_pausa obrigatoria para registrar a pausa.' }, { status: 422 })
  }
  const { operadorId, operadorNome } = operadorResolvido

  const resolution = await resolveOrder(supabase, ordemId, requestedSource)
  if (!resolution) {
    return NextResponse.json({ error: 'Ordem nao encontrada' }, { status: 404 })
  }

  const { ordem } = resolution
  if (isCanceled(ordem.status, ordem.planning_status)) {
    return NextResponse.json({ error: 'Ordem cancelada nao pode ser movimentada.' }, { status: 409 })
  }
  if (isFinalized(ordem.status, ordem.planning_status)) {
    return NextResponse.json({ error: 'Ordem ja concluida.' }, { status: 409 })
  }

  const resource = resourceForOrder(ordem)
  if (!resource.id) {
    return NextResponse.json({ error: 'A ordem precisa estar vinculada a um recurso para iniciar a producao.' }, { status: 409 })
  }

  const agoraIso = new Date().toISOString()

  if (acao === 'iniciar') {
    if (isPaused(ordem.status, ordem.planning_status)) {
      return NextResponse.json({ error: 'A ordem esta pausada. Use retomar para continuar.' }, { status: 409 })
    }

    const erroOrigem = await validarOrigemTanqueConcluida(supabase, resolution)
    if (erroOrigem) {
      return NextResponse.json({ error: erroOrigem }, { status: 422 })
    }

    const conflito = await hasOperationalConflictOnResource(supabase, resource.type, resource.id, ordem.id, resolution.source)
    if (conflito) {
      return NextResponse.json({ error: 'Ja existe outra ordem em andamento ou pausada nesse recurso.' }, { status: 409 })
    }

    const durationMinutes = resolution.isLegacy
      ? await calcularDuracaoPlanejadaMinLegado(supabase, ordem)
      : Math.max(1, Number(ordem.total_duration_minutes || 1))
    const inicioRealIso = agoraIso
    const fimPrevistoIso = calcularFim(new Date(inicioRealIso), durationMinutes).toISOString()

    const { data, error } = await updateOrder(supabase, resolution, {
      status: 'produzindo',
      planning_status: 'IN_PRODUCTION',
      operador_id: operadorId,
      operador_nome: operadorNome,
      inicio_operacao_em: ordem.inicio_operacao_em ?? inicioRealIso,
      fim_operacao_em: null,
      pausado_em: null,
      tempo_restante_pausado_seg: null,
      observacao_pausa: null,
      fim_calculado: fimPrevistoIso,
    })

    if (error) return NextResponse.json({ error }, { status: 400 })
    if (resolution.isLegacy) {
      await registrarEventoLegado(supabase, ordem, 'inicio', inicioRealIso, operadorNome)
    }
    return NextResponse.json({ ...data, flow_source: resolution.source })
  }

  if (acao === 'pausar') {
    if (!isInProduction(ordem.status, ordem.planning_status)) {
      return NextResponse.json({ error: 'Somente ordens em andamento podem ser pausadas.' }, { status: 409 })
    }

    const remainingSeconds = Math.max(0, calcularSegundosRestantes(ordem, agoraIso))
    const { data, error } = await updateOrder(supabase, resolution, {
      status: 'pausada',
      planning_status: 'PAUSED',
      operador_id: operadorId,
      operador_nome: operadorNome,
      pausado_em: agoraIso,
      tempo_restante_pausado_seg: remainingSeconds,
      observacao_pausa: observacaoPausa,
    })

    if (error) return NextResponse.json({ error }, { status: 400 })
    if (resolution.isLegacy) {
      await registrarEventoLegado(supabase, ordem, 'pausa', agoraIso, operadorNome)
    }
    return NextResponse.json({ ...data, flow_source: resolution.source })
  }

  if (acao === 'retomar') {
    if (!isPaused(ordem.status, ordem.planning_status)) {
      return NextResponse.json({ error: 'Somente ordens pausadas podem ser retomadas.' }, { status: 409 })
    }

    const erroOrigem = await validarOrigemTanqueConcluida(supabase, resolution)
    if (erroOrigem) {
      return NextResponse.json({ error: erroOrigem }, { status: 422 })
    }

    const conflito = await hasOperationalConflictOnResource(supabase, resource.type, resource.id, ordem.id, resolution.source)
    if (conflito) {
      return NextResponse.json({ error: 'Ja existe outra ordem em andamento ou pausada nesse recurso.' }, { status: 409 })
    }

    const remainingSeconds = Math.max(60, calcularSegundosRestantes(ordem, agoraIso))
    const { data, error } = await updateOrder(supabase, resolution, {
      status: 'produzindo',
      planning_status: 'IN_PRODUCTION',
      operador_id: operadorId,
      operador_nome: operadorNome,
      pausado_em: null,
      tempo_restante_pausado_seg: null,
      fim_calculado: buildEndFromRemaining(agoraIso, remainingSeconds),
    })

    if (error) return NextResponse.json({ error }, { status: 400 })
    if (resolution.isLegacy) {
      await registrarEventoLegado(supabase, ordem, 'retomada', agoraIso, operadorNome)
    }
    return NextResponse.json({ ...data, flow_source: resolution.source })
  }

  const { data, error } = await updateOrder(supabase, resolution, {
    status: 'concluida',
    planning_status: 'COMPLETED',
    operador_id: operadorId,
    operador_nome: operadorNome,
    inicio_operacao_em: ordem.inicio_operacao_em ?? agoraIso,
    fim_operacao_em: agoraIso,
    pausado_em: null,
    tempo_restante_pausado_seg: null,
    fim_calculado: agoraIso,
  })

  if (error) return NextResponse.json({ error }, { status: 400 })
  if (resolution.isLegacy) {
    await registrarEventoLegado(supabase, ordem, 'conclusao', agoraIso, operadorNome)
  }
  await liberarEnvasesAguardando(supabase, resolution)

  return NextResponse.json({ ...data, flow_source: resolution.source })
}
