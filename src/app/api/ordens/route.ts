import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validarNovaOrdem } from '@/lib/ordens/criar-ordem'
import { inferirEtapa, mapearVolumeReferenciaPorOrdem } from '@/lib/ordens/volume'
import {
  CalcMode,
  calculateEstimatedBoxes,
  calculateLitersFromBoxes,
  calculateProductionEndTime,
  calculateTankVolumeBalance,
  calculateTotalDuration,
  hasScheduleConflict,
  validateTankCapacity,
  VOLUME_BALANCE_TOLERANCE_LITERS,
} from '@/lib/planning/production'
import type { EtapaOrdem, Maquina, Ordem, PlanningStatus, Produto, Tanque } from '@/types'

type LinhaVolume = {
  id: string
  quantidade: number
  unidade: string | null
  lote: string | null
  etapa: EtapaOrdem | null
}

type OrigemTanque = {
  id: string
  etapa: EtapaOrdem
  quantidade: number
  produto_sku: string | null
  lote: string | null
  planning_status: PlanningStatus | null
  status: string
}

type EnvaseDaOrigem = {
  id: string
  quantidade: number
  planning_status: PlanningStatus | null
  status: string
}

type NovoFluxoTanque = {
  id: string
  numero_externo: string
  produto_sku: string | null
  quantidade: number
  unidade: string
  tanque: string | null
  lote: string | null
  etapa: string
  tank_id: string | null
  tank_volume_liters: number | null
  setup_time_minutes: number | null
  production_time_minutes: number | null
  cleaning_time_minutes: number | null
  total_duration_minutes: number | null
  planning_status: PlanningStatus | null
  color: string | null
  notes?: string | null
  data_prevista: string | null
  inicio_agendado: string | null
  fim_calculado: string | null
  inicio_operacao_em: string | null
  fim_operacao_em: string | null
  pausado_em: string | null
  tempo_restante_pausado_seg: number | null
  operador_nome: string | null
  status: string
  sincronizado_em: string
}

type NovoFluxoEnvase = {
  id: string
  numero_externo: string
  produto_sku: string | null
  quantidade: number
  unidade: string
  tanque: string | null
  lote: string | null
  etapa: string
  maquina_id: string | null
  package_volume_liters: number | null
  units_per_box: number | null
  box_volume_liters: number | null
  estimated_boxes: number | null
  production_time_minutes: number | null
  cleaning_time_minutes: number | null
  total_duration_minutes: number | null
  planning_status: PlanningStatus | null
  calc_mode: CalcMode | null
  color: string | null
  notes?: string | null
  origin_tank_order_id: string | null
  data_prevista: string | null
  inicio_agendado: string | null
  fim_calculado: string | null
  inicio_operacao_em: string | null
  fim_operacao_em: string | null
  pausado_em: string | null
  tempo_restante_pausado_seg: number | null
  operador_nome: string | null
  status: string
  sincronizado_em: string
}

type NovoFluxoEnvaseDaOrigem = {
  origin_tank_order_id: string | null
  quantidade: number
  planning_status: PlanningStatus | null
  status: string
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

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function mensagemErroOrdem(errorMessage: string): string {
  const lower = errorMessage.toLowerCase()
  if (lower.includes('planning_status') || lower.includes('tank_id') || lower.includes('estimated_boxes') || lower.includes('calc_mode')) {
    return 'Schema do banco desatualizado para planejamento. Rode as migrations mais recentes do Supabase.'
  }
  return errorMessage
}

function normalizarTexto(valor: unknown): string | null {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  return texto ? texto : null
}

function normalizarNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function normalizarInteiro(valor: unknown): number | null {
  const numero = normalizarNumero(valor)
  if (numero === null) return null
  return Math.round(numero)
}

function normalizarEtapa(valor: unknown, sku?: string | null, unidade?: string | null): EtapaOrdem {
  if (valor === 'tanque' || valor === 'envase') return valor
  if (valor === 'TANK') return 'tanque'
  if (valor === 'FILLING') return 'envase'
  return inferirEtapa(sku, unidade)
}

function normalizarPlanningStatus(valor: unknown): PlanningStatus | null {
  if (
    valor === 'BACKLOG' ||
    valor === 'WAITING_TANK' ||
    valor === 'READY_TO_SCHEDULE' ||
    valor === 'SCHEDULED' ||
    valor === 'IN_PRODUCTION' ||
    valor === 'PAUSED' ||
    valor === 'COMPLETED' ||
    valor === 'CANCELED'
  ) {
    return valor
  }
  return null
}

function resolverPlanningStatusEnvase(etapa: EtapaOrdem, origemTanque: OrigemTanque | null): PlanningStatus {
  if (etapa !== 'envase') return 'SCHEDULED'
  if (!origemTanque) return 'SCHEDULED'
  if (origemTanque.planning_status === 'COMPLETED') return 'SCHEDULED'
  return 'WAITING_TANK'
}

function normalizarCalcMode(valor: unknown): CalcMode {
  return valor === 'BOXES_MASTER' ? 'BOXES_MASTER' : 'LITERS_MASTER'
}

function statusPlanejamentoPadrao(statusOperacao: string | null | undefined, inicioAgendado: string | null | undefined): PlanningStatus {
  if (statusOperacao === 'cancelada') return 'CANCELED'
  if (statusOperacao === 'concluida') return 'COMPLETED'
  if (statusOperacao === 'pausada') return 'PAUSED'
  if (statusOperacao === 'produzindo' || statusOperacao === 'limpeza') return 'IN_PRODUCTION'
  if (inicioAgendado) return 'SCHEDULED'
  return 'BACKLOG'
}

function isDateInRange(dataIso: string | null | undefined, inicioMs: number, fimMs: number): boolean {
  if (!dataIso) return false
  const t = new Date(dataIso).getTime()
  return Number.isFinite(t) && t >= inicioMs && t <= fimMs
}

function isDateOnlyInRange(dataYmd: string | null | undefined, inicioYmd: string, fimYmd: string): boolean {
  if (!dataYmd) return false
  return dataYmd >= inicioYmd && dataYmd <= fimYmd
}

function isCanceled(planningStatus: PlanningStatus | null, status: string | null | undefined): boolean {
  return planningStatus === 'CANCELED' || status === 'cancelada'
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

async function carregarVolumeTanque(supabase: Awaited<ReturnType<typeof createClient>>, tankId: string | null): Promise<number | null> {
  if (!tankId) return null
  const { data } = await supabase.from('tanques').select('volume_liters').eq('id', tankId).maybeSingle()
  return normalizarNumero(data?.volume_liters)
}

async function carregarOrigemTanque(supabase: Awaited<ReturnType<typeof createClient>>, originTankOrderId: string | null): Promise<OrigemTanque | null> {
  if (!originTankOrderId) return null
  const { data, error } = await supabase
    .from('ordens')
    .select('id, etapa, quantidade, produto_sku, lote, planning_status, status')
    .eq('id', originTankOrderId)
    .maybeSingle()
  if (error || !data) return null
  return data as OrigemTanque
}

async function somarLitrosEnvaseDaOrigem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  originTankOrderId: string,
  excludeOrderId?: string
) {
  let query = supabase
    .from('ordens')
    .select('id, quantidade, planning_status, status')
    .eq('etapa', 'envase')
    .eq('origin_tank_order_id', originTankOrderId)
    .neq('status', 'cancelada')

  if (excludeOrderId) query = query.neq('id', excludeOrderId)

  const { data, error } = await query
  if (error) return 0

  return ((data as EnvaseDaOrigem[]) ?? []).reduce((acc, row) => {
    const planningStatus = normalizarPlanningStatus(row.planning_status)
    if (isCanceled(planningStatus, row.status)) return acc
    return acc + Number(row.quantidade || 0)
  }, 0)
}

async function calcularBalanceamentoTanque(
  supabase: Awaited<ReturnType<typeof createClient>>,
  originTankOrderId: string,
  currentFillingLiters = 0,
  excludeOrderId?: string
) {
  const origem = await carregarOrigemTanque(supabase, originTankOrderId)
  if (!origem || origem.etapa !== 'tanque') return null
  const litrosEnvasados = await somarLitrosEnvaseDaOrigem(supabase, originTankOrderId, excludeOrderId)
  const balance = calculateTankVolumeBalance({
    tankLiters: Number(origem.quantidade || 0),
    alreadyFilledLiters: litrosEnvasados,
    currentFillingLiters,
    tolerance: VOLUME_BALANCE_TOLERANCE_LITERS,
  })

  return {
    originTankOrderId,
    tankLiters: Number(origem.quantidade || 0),
    alreadyFilledLiters: litrosEnvasados,
    projectedFilledLiters: balance.totalFilledLiters,
    deltaLiters: balance.deltaLiters,
    status: balance.status,
    warning: balance.warning,
    produtoSku: origem.produto_sku,
    lote: origem.lote,
  }
}

async function validarConclusaoSemDivergencia({
  supabase,
  ordem,
  requestedPlanningStatus,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  ordem: Ordem
  requestedPlanningStatus: PlanningStatus | null
}) {
  if (requestedPlanningStatus !== 'COMPLETED') return null

  const tankOrderId = ordem.etapa === 'tanque' ? ordem.id : normalizarTexto(ordem.origin_tank_order_id)
  if (!tankOrderId) return null

  const balance = await calcularBalanceamentoTanque(supabase, tankOrderId)
  if (!balance) return null

  if (Math.abs(balance.deltaLiters) > VOLUME_BALANCE_TOLERANCE_LITERS) {
    return `Nao e possivel concluir enquanto houver divergencia de volume: ${balance.warning ?? 'diferenca detectada'}`
  }

  return null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const data = searchParams.get('data')
  const diasParam = searchParams.get('dias')
  const inicioParam = searchParams.get('inicio')
  const fimParam = searchParams.get('fim')

  let query = supabase
    .from('ordens')
    .select('*, produto:produtos(*), maquina:maquinas(*), tanque_ref:tanques(*)')
    .neq('status', 'cancelada')
    .order('inicio_agendado', { ascending: true, nullsFirst: false })

  if (data && !DATE_REGEX.test(data)) return NextResponse.json({ error: 'data invalida' }, { status: 400 })
  if (inicioParam && !DATE_REGEX.test(inicioParam)) return NextResponse.json({ error: 'inicio invalido' }, { status: 400 })
  if (fimParam && !DATE_REGEX.test(fimParam)) return NextResponse.json({ error: 'fim invalido' }, { status: 400 })
  if ((inicioParam && !fimParam) || (!inicioParam && fimParam)) {
    return NextResponse.json({ error: 'inicio e fim devem ser informados juntos' }, { status: 400 })
  }
  if (inicioParam && fimParam && inicioParam > fimParam) {
    return NextResponse.json({ error: 'inicio deve ser menor ou igual ao fim' }, { status: 400 })
  }

  let dias: number | null = null
  if (diasParam) {
    const parsed = Number(diasParam)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60) {
      return NextResponse.json({ error: 'dias invalido (use 1..60)' }, { status: 400 })
    }
    dias = parsed
  }

  if (inicioParam && fimParam) {
    query = query.or(
      `and(data_prevista.gte.${inicioParam},data_prevista.lte.${fimParam}),and(inicio_agendado.gte.${inicioParam}T00:00:00.000Z,inicio_agendado.lte.${fimParam}T23:59:59.999Z),and(fim_calculado.gte.${inicioParam}T00:00:00.000Z,fim_calculado.lte.${fimParam}T23:59:59.999Z),inicio_agendado.is.null`
    )
  } else if (data && !dias) {
    query = query.or(`data_prevista.eq.${data},inicio_agendado.is.null`)
  }

  const { data: ordens, error } = await query
  if (error) return NextResponse.json({ error: mensagemErroOrdem(error.message) }, { status: 500 })

  let lista = Array.isArray(ordens) ? ordens : []

  let queryTanquesNovo = supabase
    .from('ordens_tanque_novo_fluxo')
    .select('*')
    .neq('status', 'cancelada')
    .order('inicio_agendado', { ascending: true, nullsFirst: false })

  let queryEnvasesNovo = supabase
    .from('ordens_envase_novo_fluxo')
    .select('*')
    .neq('status', 'cancelada')
    .order('inicio_agendado', { ascending: true, nullsFirst: false })

  if (inicioParam && fimParam) {
    const rangeFilter =
      `and(data_prevista.gte.${inicioParam},data_prevista.lte.${fimParam}),` +
      `and(inicio_agendado.gte.${inicioParam}T00:00:00.000Z,inicio_agendado.lte.${fimParam}T23:59:59.999Z),` +
      `and(fim_calculado.gte.${inicioParam}T00:00:00.000Z,fim_calculado.lte.${fimParam}T23:59:59.999Z),` +
      'inicio_agendado.is.null'
    queryTanquesNovo = queryTanquesNovo.or(rangeFilter)
    queryEnvasesNovo = queryEnvasesNovo.or(rangeFilter)
  } else if (data && !dias) {
    const sameDayFilter = `data_prevista.eq.${data},inicio_agendado.is.null`
    queryTanquesNovo = queryTanquesNovo.or(sameDayFilter)
    queryEnvasesNovo = queryEnvasesNovo.or(sameDayFilter)
  }

  const [
    { data: tanquesNovo, error: tanquesNovoError },
    { data: envasesNovo, error: envasesNovoError },
    { data: produtosNovo },
    { data: maquinasNovo },
    { data: tanquesRefNovo },
  ] = await Promise.all([
    queryTanquesNovo,
    queryEnvasesNovo,
    supabase.from('produtos').select('*'),
    supabase.from('maquinas').select('*'),
    supabase.from('tanques').select('*'),
  ])

  if (tanquesNovoError) return NextResponse.json({ error: mensagemErroOrdem(tanquesNovoError.message) }, { status: 500 })
  if (envasesNovoError) return NextResponse.json({ error: mensagemErroOrdem(envasesNovoError.message) }, { status: 500 })

  const produtosMap = new Map(((produtosNovo as Produto[] | null) ?? []).map((produto) => [produto.sku, produto]))
  const maquinasMap = new Map(((maquinasNovo as Maquina[] | null) ?? []).map((maquina) => [maquina.id, maquina]))
  const tanquesMap = new Map(((tanquesRefNovo as Tanque[] | null) ?? []).map((tanque) => [tanque.id, tanque]))

  lista = [
    ...lista,
    ...(((tanquesNovo as NovoFluxoTanque[] | null) ?? []).map((ordem) => {
      const compat = parseCompatNotes(ordem.notes)
      const operacao = compat.operacao ?? {}
      return {
        ...ordem,
        inicio_operacao_em: ordem.inicio_operacao_em ?? operacao.inicio_operacao_em ?? null,
        fim_operacao_em: ordem.fim_operacao_em ?? operacao.fim_operacao_em ?? null,
        pausado_em: ordem.pausado_em ?? operacao.pausado_em ?? null,
        tempo_restante_pausado_seg: ordem.tempo_restante_pausado_seg ?? operacao.tempo_restante_pausado_seg ?? null,
        operador_nome: ordem.operador_nome ?? operacao.operador_nome ?? null,
        etapa: 'tanque',
        calc_mode: 'LITERS_MASTER',
        flow_source: 'novo_fluxo_tanque',
        produto: ordem.produto_sku ? produtosMap.get(ordem.produto_sku) ?? undefined : undefined,
        maquina: undefined,
        tanque_ref: ordem.tank_id ? tanquesMap.get(ordem.tank_id) ?? undefined : undefined,
      }
    })),
    ...(((envasesNovo as NovoFluxoEnvase[] | null) ?? []).map((ordem) => {
      const compat = parseCompatNotes(ordem.notes)
      const operacao = compat.operacao ?? {}
      return {
        ...ordem,
        inicio_operacao_em: ordem.inicio_operacao_em ?? operacao.inicio_operacao_em ?? null,
        fim_operacao_em: ordem.fim_operacao_em ?? operacao.fim_operacao_em ?? null,
        pausado_em: ordem.pausado_em ?? operacao.pausado_em ?? null,
        tempo_restante_pausado_seg: ordem.tempo_restante_pausado_seg ?? operacao.tempo_restante_pausado_seg ?? null,
        operador_nome: ordem.operador_nome ?? operacao.operador_nome ?? null,
        etapa: 'envase',
        flow_source: 'novo_fluxo_envase',
        produto: ordem.produto_sku ? produtosMap.get(ordem.produto_sku) ?? undefined : undefined,
        maquina: ordem.maquina_id ? maquinasMap.get(ordem.maquina_id) ?? undefined : undefined,
        tanque_ref: undefined,
      }
    })),
  ]

  if (inicioParam && fimParam) {
    const inicioMs = new Date(`${inicioParam}T00:00:00`).getTime()
    const fimDate = new Date(`${fimParam}T00:00:00`)
    fimDate.setHours(23, 59, 59, 999)
    const fimMs = fimDate.getTime()

    lista = lista.filter((ordem) => {
      return (
        isDateOnlyInRange(ordem.data_prevista, inicioParam, fimParam) ||
        isDateInRange(ordem.inicio_agendado, inicioMs, fimMs) ||
        isDateInRange(ordem.fim_calculado, inicioMs, fimMs) ||
        ordem.inicio_agendado === null
      )
    })
  } else if (dias) {
    const baseDateYmd = data ?? new Date().toISOString().slice(0, 10)
    const base = new Date(`${baseDateYmd}T00:00:00`)
    const inicio = new Date(base)
    inicio.setDate(inicio.getDate() - (dias - 1))
    const fim = new Date(base)
    fim.setHours(23, 59, 59, 999)

    const inicioMs = inicio.getTime()
    const fimMs = fim.getTime()
    const inicioYmd = inicio.toISOString().slice(0, 10)
    const fimYmd = baseDateYmd

    lista = lista.filter((ordem) => {
      return (
        isDateOnlyInRange(ordem.data_prevista, inicioYmd, fimYmd) ||
        isDateInRange(ordem.inicio_agendado, inicioMs, fimMs) ||
        isDateInRange(ordem.inicio_operacao_em, inicioMs, fimMs) ||
        isDateInRange(ordem.fim_operacao_em, inicioMs, fimMs)
      )
    })
  }

  lista = lista.sort((a, b) => {
    const aTime = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    if (aTime !== bTime) return aTime - bTime
    return String(a.numero_externo ?? '').localeCompare(String(b.numero_externo ?? ''))
  })

  const volumePorOrdem = mapearVolumeReferenciaPorOrdem(
    lista.map((ordem) => ({
      id: ordem.id,
      quantidade: Number(ordem.quantidade),
      unidade: ordem.unidade,
      lote: ordem.lote,
      etapa: normalizarEtapa(ordem.etapa, ordem.produto_sku, ordem.unidade),
    } as LinhaVolume))
  )

  const tankOrderIds = new Set<string>()
  for (const ordem of lista) {
    if (ordem.etapa === 'tanque') tankOrderIds.add(ordem.id)
    if (ordem.etapa === 'envase' && ordem.origin_tank_order_id) tankOrderIds.add(ordem.origin_tank_order_id)
  }

  const envasedByOrigin = new Map<string, number>()
  if (tankOrderIds.size > 0) {
    const [{ data: envases }, { data: novosEnvasesDaOrigem }] = await Promise.all([
      supabase
        .from('ordens')
        .select('origin_tank_order_id, quantidade, planning_status, status')
        .eq('etapa', 'envase')
        .in('origin_tank_order_id', Array.from(tankOrderIds))
        .neq('status', 'cancelada'),
      supabase
        .from('ordens_envase_novo_fluxo')
        .select('origin_tank_order_id, quantidade, planning_status, status')
        .in('origin_tank_order_id', Array.from(tankOrderIds))
        .neq('status', 'cancelada'),
    ])

    for (const envase of ((envases as Array<{ origin_tank_order_id: string | null; quantidade: number; planning_status: PlanningStatus | null; status: string }>) ?? [])) {
      if (!envase.origin_tank_order_id) continue
      if (isCanceled(normalizarPlanningStatus(envase.planning_status), envase.status)) continue
      const current = envasedByOrigin.get(envase.origin_tank_order_id) ?? 0
      envasedByOrigin.set(envase.origin_tank_order_id, current + Number(envase.quantidade || 0))
    }

    for (const envase of ((novosEnvasesDaOrigem as NovoFluxoEnvaseDaOrigem[] | null) ?? [])) {
      if (!envase.origin_tank_order_id) continue
      if (isCanceled(normalizarPlanningStatus(envase.planning_status), envase.status)) continue
      const current = envasedByOrigin.get(envase.origin_tank_order_id) ?? 0
      envasedByOrigin.set(envase.origin_tank_order_id, current + Number(envase.quantidade || 0))
    }
  }

  const comVolume = lista.map((ordem) => {
    const planning_status =
      normalizarPlanningStatus(ordem.planning_status) ?? statusPlanejamentoPadrao(ordem.status, ordem.inicio_agendado)
    const compat = parseCompatNotes(ordem.notes)
    const operacaoCompat = compat.operacao ?? {}
    const enriched: Record<string, unknown> = {
      ...ordem,
      etapa: normalizarEtapa(ordem.etapa, ordem.produto_sku, ordem.unidade),
      planning_status,
      calc_mode: normalizarCalcMode(ordem.calc_mode),
      flow_source: ordem.flow_source ?? 'legado',
      operador_id: ordem.operador_id ?? operacaoCompat.operador_id ?? null,
      operador_nome: ordem.operador_nome ?? operacaoCompat.operador_nome ?? null,
      observacao_pausa: ordem.observacao_pausa ?? operacaoCompat.observacao_pausa ?? null,
      quantidade_referencia_litros: volumePorOrdem[ordem.id] ?? Number(ordem.quantidade),
    }

    if (ordem.etapa === 'tanque') {
      const litrosEnvasados = envasedByOrigin.get(ordem.id) ?? 0
      const balance = calculateTankVolumeBalance({
        tankLiters: Number(ordem.quantidade || 0),
        alreadyFilledLiters: litrosEnvasados,
      })
      enriched.origin_tank_liters = Number(ordem.quantidade || 0)
      enriched.origin_tank_filled_liters = litrosEnvasados
      enriched.origin_tank_delta_liters = balance.deltaLiters
      enriched.origin_tank_balance_status = balance.status
    } else if (ordem.origin_tank_order_id) {
      const litrosEnvasados = envasedByOrigin.get(ordem.origin_tank_order_id) ?? 0
      const origemNaLista = lista.find((item) => item.id === ordem.origin_tank_order_id)
      const litrosTanque = Number(origemNaLista?.quantidade ?? 0)
      if (litrosTanque > 0) {
        const balance = calculateTankVolumeBalance({
          tankLiters: litrosTanque,
          alreadyFilledLiters: litrosEnvasados,
        })
        enriched.origin_tank_liters = litrosTanque
        enriched.origin_tank_filled_liters = litrosEnvasados
        enriched.origin_tank_delta_liters = balance.deltaLiters
        enriched.origin_tank_balance_status = balance.status
      }
    }

    return enriched
  })

  return NextResponse.json(comVolume)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const id = normalizarTexto(body.id)
  if (!id) return NextResponse.json({ error: 'id obrigatorio' }, { status: 400 })

  const inicio_agendado = body.inicio_agendado as string | null | undefined
  const fim_calculado = body.fim_calculado as string | null | undefined
  const maquina_id = normalizarTexto(body.maquina_id ?? body.machine_id)
  const tank_id = normalizarTexto(body.tank_id)

  const metaUpdates: Record<string, unknown> = {}
  if (body.tanque !== undefined) metaUpdates.tanque = normalizarTexto(body.tanque)
  if (body.lote !== undefined) metaUpdates.lote = normalizarTexto(body.lote)
  if (body.etapa !== undefined || body.productionType !== undefined) metaUpdates.etapa = normalizarEtapa(body.etapa ?? body.productionType)
  if (body.tank_id !== undefined) metaUpdates.tank_id = tank_id
  if (body.origin_tank_order_id !== undefined) metaUpdates.origin_tank_order_id = normalizarTexto(body.origin_tank_order_id)
  if (body.color !== undefined) metaUpdates.color = normalizarTexto(body.color)
  if (body.planning_status !== undefined) {
    const normalized = normalizarPlanningStatus(body.planning_status)
    if (normalized) metaUpdates.planning_status = normalized
  }
  if (body.calc_mode !== undefined) metaUpdates.calc_mode = normalizarCalcMode(body.calc_mode)
  if (body.package_volume_liters !== undefined) metaUpdates.package_volume_liters = normalizarNumero(body.package_volume_liters)
  if (body.units_per_box !== undefined) metaUpdates.units_per_box = normalizarInteiro(body.units_per_box)
  if (body.setup_time_minutes !== undefined) metaUpdates.setup_time_minutes = normalizarInteiro(body.setup_time_minutes)
  if (body.production_time_minutes !== undefined) metaUpdates.production_time_minutes = normalizarInteiro(body.production_time_minutes)
  if (body.cleaning_time_minutes !== undefined) metaUpdates.cleaning_time_minutes = normalizarInteiro(body.cleaning_time_minutes)
  if (body.estimated_boxes !== undefined) metaUpdates.estimated_boxes = normalizarInteiro(body.estimated_boxes)
  if (body.box_volume_liters !== undefined) metaUpdates.box_volume_liters = normalizarNumero(body.box_volume_liters)
  if (body.tank_volume_liters !== undefined) metaUpdates.tank_volume_liters = normalizarNumero(body.tank_volume_liters)

  const { data: ordemData, error: ordemError } = await supabase
    .from('ordens')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (ordemError) return NextResponse.json({ error: mensagemErroOrdem(ordemError.message) }, { status: 400 })
  if (!ordemData) return NextResponse.json({ error: 'Ordem nao encontrada' }, { status: 404 })

  const etapa = normalizarEtapa(metaUpdates.etapa ?? ordemData.etapa, ordemData.produto_sku, ordemData.unidade)
  const originTankOrderId = normalizarTexto(metaUpdates.origin_tank_order_id ?? ordemData.origin_tank_order_id)
  const requestedPlanningStatus = normalizarPlanningStatus(metaUpdates.planning_status ?? ordemData.planning_status)

  if (inicio_agendado === undefined && body.maquina_id === undefined && body.machine_id === undefined) {
    if (Object.keys(metaUpdates).length === 0) return NextResponse.json({ error: 'nenhuma alteracao enviada' }, { status: 422 })

    if (etapa === 'envase') {
      if (!originTankOrderId) return NextResponse.json({ error: 'Origem de tanque obrigatoria para envase' }, { status: 422 })
      const origem = await carregarOrigemTanque(supabase, originTankOrderId)
      if (!origem || origem.etapa !== 'tanque') {
        return NextResponse.json({ error: 'Origem de tanque invalida para envase' }, { status: 422 })
      }
    }

    const conclusaoError = await validarConclusaoSemDivergencia({
      supabase,
      ordem: { ...(ordemData as Ordem), etapa, origin_tank_order_id: originTankOrderId },
      requestedPlanningStatus,
    })
    if (conclusaoError) return NextResponse.json({ error: conclusaoError }, { status: 422 })

    const { data: updated, error } = await supabase.from('ordens').update(metaUpdates).eq('id', id).select('*').single()
    if (error) return NextResponse.json({ error: mensagemErroOrdem(error.message) }, { status: 400 })
    return NextResponse.json(updated)
  }

  if (inicio_agendado === null) {
    const { data: updated, error } = await supabase
      .from('ordens')
      .update({
        maquina_id: null,
        tank_id: null,
        inicio_agendado: null,
        fim_calculado: null,
        planning_status: 'BACKLOG',
        ...metaUpdates,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: mensagemErroOrdem(error.message) }, { status: 400 })
    return NextResponse.json(updated)
  }

  if (!inicio_agendado) return NextResponse.json({ error: 'inicio_agendado obrigatorio' }, { status: 422 })

  const resourceTankId = tank_id ?? normalizarTexto(ordemData.tank_id)
  const resourceMachineId = maquina_id ?? normalizarTexto(ordemData.maquina_id)

  if (etapa === 'tanque' && !resourceTankId) {
    return NextResponse.json({ error: 'tank_id e obrigatorio para producao em tanque' }, { status: 422 })
  }
  if (etapa === 'envase') {
    if (!resourceMachineId) return NextResponse.json({ error: 'maquina_id e obrigatorio para envase' }, { status: 422 })
    if (!originTankOrderId) return NextResponse.json({ error: 'Origem de tanque obrigatoria para envase' }, { status: 422 })
  }

  const calcMode = normalizarCalcMode(metaUpdates.calc_mode ?? body.calc_mode ?? ordemData.calc_mode)
  const packageVolumeLiters = normalizarNumero(metaUpdates.package_volume_liters ?? body.package_volume_liters ?? ordemData.package_volume_liters)
  const unitsPerBox = normalizarInteiro(metaUpdates.units_per_box ?? body.units_per_box ?? ordemData.units_per_box) ?? 1
  const inputBoxes = normalizarInteiro(metaUpdates.estimated_boxes ?? body.estimated_boxes ?? ordemData.estimated_boxes)

  let litros = Number(body.liters ?? ordemData.quantidade ?? 0)
  if (calcMode === 'BOXES_MASTER' && inputBoxes !== null && packageVolumeLiters !== null && unitsPerBox > 0) {
    litros = calculateLitersFromBoxes({
      boxes: inputBoxes,
      packageVolumeLiters,
      unitsPerBox,
    })
  }
  if (!Number.isFinite(litros) || litros <= 0) return NextResponse.json({ error: 'Litros invalido' }, { status: 422 })

  const setupTimeMinutes = normalizarInteiro(metaUpdates.setup_time_minutes ?? ordemData.setup_time_minutes) ?? 0
  const rawProductionTimeMinutes = normalizarInteiro(metaUpdates.production_time_minutes ?? ordemData.production_time_minutes) ?? 0
  const cleaningTimeMinutes = normalizarInteiro(metaUpdates.cleaning_time_minutes ?? ordemData.cleaning_time_minutes) ?? 0
  const totalDurationFallback = normalizarInteiro(ordemData.total_duration_minutes) ?? 0
  const productionTimeMinutes = rawProductionTimeMinutes > 0
    ? rawProductionTimeMinutes
    : Math.max(0, totalDurationFallback - setupTimeMinutes - cleaningTimeMinutes)
  if (setupTimeMinutes < 0 || productionTimeMinutes <= 0 || cleaningTimeMinutes < 0) {
    return NextResponse.json({ error: 'Defina o tempo de producao da ordem antes de agendar.' }, { status: 422 })
  }
  if (packageVolumeLiters !== null && packageVolumeLiters <= 0) {
    return NextResponse.json({ error: 'packageVolumeLiters deve ser maior que zero' }, { status: 422 })
  }
  if (unitsPerBox <= 0) return NextResponse.json({ error: 'unitsPerBox deve ser maior que zero' }, { status: 422 })

  const tanqueVolumeFromTable = await carregarVolumeTanque(supabase, resourceTankId)
  const tankVolumeLiters = normalizarNumero(metaUpdates.tank_volume_liters ?? tanqueVolumeFromTable ?? ordemData.tank_volume_liters)
  if (etapa === 'tanque' && resourceTankId && tankVolumeLiters !== null && !validateTankCapacity(litros, tankVolumeLiters)) {
    return NextResponse.json({ error: 'Volume planejado ultrapassa a capacidade do tanque selecionado' }, { status: 422 })
  }

  let origemTanque: OrigemTanque | null = null
  if (etapa === 'envase' && originTankOrderId) {
    origemTanque = await carregarOrigemTanque(supabase, originTankOrderId)
    if (!origemTanque || origemTanque.etapa !== 'tanque') return NextResponse.json({ error: 'Origem de tanque invalida para envase' }, { status: 422 })
  }

  const inicio = new Date(inicio_agendado)
  if (!Number.isFinite(inicio.getTime())) return NextResponse.json({ error: 'inicio_agendado invalido' }, { status: 422 })

  const totalDurationMinutes = Math.max(
    1,
    calculateTotalDuration({
      setupTimeMinutes,
      productionTimeMinutes,
      cleaningTimeMinutes,
    })
  )
  const fimManual = typeof fim_calculado === 'string' ? new Date(fim_calculado) : null
  const fim = fimManual && Number.isFinite(fimManual.getTime()) ? fimManual : calculateProductionEndTime(inicio, totalDurationMinutes)
  if (!Number.isFinite(fim.getTime()) || fim <= inicio) {
    return NextResponse.json({ error: 'fim_calculado deve ser maior que inicio_agendado' }, { status: 422 })
  }

  const { boxVolumeLiters, estimatedBoxes } = calculateEstimatedBoxes({
    liters: litros,
    packageVolumeLiters: packageVolumeLiters ?? 0,
    unitsPerBox,
  })

  const { data: ordensExistentes } = await supabase.from('ordens').select('*').not('id', 'eq', id).not('inicio_agendado', 'is', null)
  const conflict = hasScheduleConflict({
    ordemId: id,
    productionType: etapa === 'tanque' ? 'TANK' : 'FILLING',
    tankId: resourceTankId,
    machineId: resourceMachineId,
    newStart: inicio,
    newEnd: fim,
    existingSchedules: (ordensExistentes as Ordem[]) ?? [],
  })
  if (conflict) return NextResponse.json({ error: 'Ja existe uma producao agendada nesse recurso para este horario.' }, { status: 409 })

  const updates: Record<string, unknown> = {
    maquina_id: etapa === 'envase' ? resourceMachineId : null,
    tank_id: resourceTankId,
    quantidade: litros,
    etapa,
    origin_tank_order_id: originTankOrderId,
    inicio_agendado: inicio.toISOString(),
    fim_calculado: fim.toISOString(),
    total_duration_minutes: totalDurationMinutes,
    setup_time_minutes: setupTimeMinutes,
    production_time_minutes: productionTimeMinutes,
    cleaning_time_minutes: cleaningTimeMinutes,
    planning_status: resolverPlanningStatusEnvase(etapa, origemTanque),
    calc_mode: calcMode,
    tank_volume_liters: tankVolumeLiters,
    package_volume_liters: packageVolumeLiters,
    units_per_box: unitsPerBox,
    box_volume_liters: boxVolumeLiters || null,
    estimated_boxes: calcMode === 'BOXES_MASTER' && inputBoxes !== null ? inputBoxes : (packageVolumeLiters ? estimatedBoxes : null),
    ...metaUpdates,
  }

  const { data: updated, error } = await supabase.from('ordens').update(updates).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: mensagemErroOrdem(error.message) }, { status: 400 })

  let volume_balance = null
  if (etapa === 'envase' && originTankOrderId) {
    volume_balance = await calcularBalanceamentoTanque(supabase, originTankOrderId, litros, id)
  }

  return NextResponse.json({ ...updated, volume_balance })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const unidade = String(body.unidade ?? 'L').toUpperCase()
  const etapa = normalizarEtapa(body.etapa ?? body.productionType, body.produto_sku, unidade)
  const calcMode = normalizarCalcMode(body.calc_mode)
  const packageVolumeLiters = normalizarNumero(body.package_volume_liters ?? body.packageVolumeLiters)
  const unitsPerBox = normalizarInteiro(body.units_per_box ?? body.unitsPerBox) ?? 1
  const inputBoxes = normalizarInteiro(body.estimated_boxes ?? body.estimatedBoxes)
  let liters = Number(body.liters ?? body.quantidade ?? 0)
  if (calcMode === 'BOXES_MASTER' && inputBoxes !== null && packageVolumeLiters !== null && unitsPerBox > 0) {
    liters = calculateLitersFromBoxes({
      boxes: inputBoxes,
      packageVolumeLiters,
      unitsPerBox,
    })
  }

  const setupTimeMinutes = normalizarInteiro(body.setup_time_minutes ?? body.setupTimeMinutes) ?? 0
  const productionTimeMinutes = normalizarInteiro(body.production_time_minutes ?? body.productionTimeMinutes) ?? 0
  const cleaningTimeMinutes = normalizarInteiro(body.cleaning_time_minutes ?? body.cleaningTimeMinutes) ?? 0
  const tankId = normalizarTexto(body.tank_id)
  const machineId = normalizarTexto(body.maquina_id ?? body.machine_id)
  const originTankOrderId = normalizarTexto(body.origin_tank_order_id)
  const plannedDate = normalizarTexto(body.data_prevista)
  const plannedStartAt = normalizarTexto(body.inicio_agendado ?? body.planned_start_at ?? body.plannedStartAt)
  const planningStatusFromBody = normalizarPlanningStatus(body.planning_status)
  const color = normalizarTexto(body.color)
  const tankLabel = normalizarTexto(body.tanque)

  const resultado = validarNovaOrdem({
    produto_sku: body.produto_sku ?? '',
    quantidade: liters,
    unidade,
    data_prevista: plannedDate,
    setup_time_minutes: setupTimeMinutes,
    production_time_minutes: productionTimeMinutes,
    cleaning_time_minutes: cleaningTimeMinutes,
    etapa,
    tank_id: tankId,
    machine_id: machineId,
    package_volume_liters: packageVolumeLiters,
    units_per_box: unitsPerBox,
    origin_tank_order_id: originTankOrderId,
  })
  if (resultado.erro) return NextResponse.json({ error: resultado.erro }, { status: 422 })

  const { data: produto } = await supabase.from('produtos').select('sku, cor').eq('sku', body.produto_sku).single()
  if (!produto) return NextResponse.json({ error: 'Produto nao encontrado' }, { status: 404 })

  let originTank: OrigemTanque | null = null
  if (etapa === 'envase') {
    originTank = await carregarOrigemTanque(supabase, originTankOrderId)
    if (!originTank || originTank.etapa !== 'tanque') {
      return NextResponse.json({ error: 'Origem de tanque invalida para envase' }, { status: 422 })
    }
    if (isCanceled(originTank.planning_status, originTank.status)) {
      return NextResponse.json({ error: 'Origem de tanque cancelada nao pode ser usada no envase' }, { status: 422 })
    }
  }

  const tanqueVolume = await carregarVolumeTanque(supabase, tankId)
  if (etapa === 'tanque' && tankId && tanqueVolume !== null && !validateTankCapacity(liters, tanqueVolume)) {
    return NextResponse.json({ error: 'Volume planejado ultrapassa a capacidade do tanque selecionado' }, { status: 422 })
  }

  const totalDurationMinutes = Math.max(
    1,
    calculateTotalDuration({
      setupTimeMinutes,
      productionTimeMinutes,
      cleaningTimeMinutes,
    })
  )

  const startAt = plannedStartAt ? new Date(plannedStartAt) : null
  if (startAt && !Number.isFinite(startAt.getTime())) {
    return NextResponse.json({ error: 'plannedStartAt invalido' }, { status: 422 })
  }

  if (startAt && etapa === 'tanque' && !tankId) {
    return NextResponse.json({ error: 'tank_id e obrigatorio para producao em tanque agendada' }, { status: 422 })
  }
  if (startAt && etapa === 'envase' && !machineId) {
    return NextResponse.json({ error: 'maquina_id e obrigatorio para envase agendado' }, { status: 422 })
  }

  const fim = startAt ? calculateProductionEndTime(startAt, totalDurationMinutes) : null
  const { boxVolumeLiters, estimatedBoxes } = calculateEstimatedBoxes({
    liters,
    packageVolumeLiters: packageVolumeLiters ?? 0,
    unitsPerBox,
  })

  if (startAt) {
    const { data: existentes } = await supabase.from('ordens').select('*').not('inicio_agendado', 'is', null)
    const hasConflict = hasScheduleConflict({
      productionType: etapa === 'tanque' ? 'TANK' : 'FILLING',
      tankId,
      machineId,
      newStart: startAt,
      newEnd: fim as Date,
      existingSchedules: (existentes as Ordem[]) ?? [],
    })
    if (hasConflict) {
      return NextResponse.json({ error: 'Ja existe uma producao agendada nesse recurso para este horario.' }, { status: 409 })
    }
  }

  const numero_externo = `MAN-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`
  const planningStatus: PlanningStatus = planningStatusFromBody ?? (startAt ? 'SCHEDULED' : 'BACKLOG')

  const { data: nova, error } = await supabase
    .from('ordens')
    .insert({
      numero_externo,
      produto_sku: etapa === 'envase' ? originTank?.produto_sku ?? body.produto_sku : body.produto_sku,
      quantidade: liters,
      unidade,
      data_prevista: plannedDate,
      tanque: tankLabel,
      lote: etapa === 'envase' ? originTank?.lote ?? normalizarTexto(body.lote) : normalizarTexto(body.lote),
      etapa,
      status: 'aguardando',
      maquina_id: etapa === 'envase' ? machineId : null,
      tank_id: tankId,
      tank_volume_liters: tanqueVolume,
      package_volume_liters: packageVolumeLiters,
      units_per_box: unitsPerBox,
      box_volume_liters: boxVolumeLiters || null,
      estimated_boxes: calcMode === 'BOXES_MASTER' && inputBoxes !== null ? inputBoxes : (packageVolumeLiters ? estimatedBoxes : null),
      setup_time_minutes: setupTimeMinutes,
      production_time_minutes: productionTimeMinutes,
      cleaning_time_minutes: cleaningTimeMinutes,
      total_duration_minutes: totalDurationMinutes,
      inicio_agendado: startAt ? startAt.toISOString() : null,
      fim_calculado: fim ? fim.toISOString() : null,
      planning_status: planningStatus,
      calc_mode: calcMode,
      color: color ?? produto.cor ?? null,
      origin_tank_order_id: originTankOrderId,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: mensagemErroOrdem(error.message) }, { status: 400 })

  let volume_balance = null
  if (etapa === 'envase' && originTankOrderId) {
    volume_balance = await calcularBalanceamentoTanque(supabase, originTankOrderId, liters)
  }

  return NextResponse.json({ ...nova, volume_balance }, { status: 201 })
}
