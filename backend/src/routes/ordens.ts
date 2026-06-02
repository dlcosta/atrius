import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'
import { validarNovaOrdem } from '../lib/ordens/criar-ordem'
import { inferirEtapa, mapearVolumeReferenciaPorOrdem, obterVolumeReferenciaLitros } from '../lib/ordens/volume'
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
} from '../lib/planning/production'
import { calcularDuracao, calcularFim } from '../lib/planning/engine'
import { isScheduleStartInPast, SCHEDULE_IN_PAST_ERROR } from '../lib/planning/schedule'
import { buscarOperadorPorId } from '../lib/operators/store'
import {
  parseCompatNotes,
  mergeCompatNotes,
  buildIniciarUpdate,
  buildPausarUpdate,
  buildRetomarUpdate,
  buildFinalizarUpdate,
} from '../lib/ordens/operacao'
import { isDateInRange, isDateOnlyInRange } from '../lib/ordens/filtro-data'
import type { EtapaOrdem, FlowSource, Maquina, Ordem, PlanningStatus, Produto, Tanque } from '../types'
import { SupabaseClient } from '@supabase/supabase-js'

const router = Router()

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
    valor === 'BACKLOG' || valor === 'WAITING_TANK' || valor === 'READY_TO_SCHEDULE' ||
    valor === 'SCHEDULED' || valor === 'IN_PRODUCTION' || valor === 'PAUSED' ||
    valor === 'COMPLETED' || valor === 'CANCELED'
  ) {
    return valor as PlanningStatus
  }
  return null
}

function resolverPlanningStatusEnvase(etapa: EtapaOrdem, origemTanque: any | null): PlanningStatus {
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

function isCanceled(planningStatus: PlanningStatus | null, status: string | null | undefined): boolean {
  return planningStatus === 'CANCELED' || status === 'cancelada'
}

async function carregarVolumeTanque(supabase: SupabaseClient, tankId: string | null): Promise<number | null> {
  if (!tankId) return null
  const { data } = await supabase.from('tanques').select('volume_liters').eq('id', tankId).maybeSingle()
  return normalizarNumero(data?.volume_liters)
}

async function carregarOrigemTanque(supabase: SupabaseClient, originTankOrderId: string | null): Promise<any | null> {
  if (!originTankOrderId) return null
  const { data } = await supabase
    .from('ordens')
    .select('id, etapa, quantidade, produto_sku, lote, planning_status, status')
    .eq('id', originTankOrderId)
    .maybeSingle()
  if (data) return data

  // Fallback: novo fluxo
  const { data: novoFluxo } = await supabase
    .from('ordens_tanque_novo_fluxo')
    .select('id, quantidade, produto_sku, lote, planning_status, status')
    .eq('id', originTankOrderId)
    .maybeSingle()
  if (novoFluxo) return { ...novoFluxo, etapa: 'tanque' }
  return null
}

async function somarLitrosEnvaseDaOrigem(supabase: SupabaseClient, originTankOrderId: string, excludeOrderId?: string) {
  let queryLegacy = supabase
    .from('ordens')
    .select('id, quantidade, planning_status, status')
    .eq('etapa', 'envase')
    .eq('origin_tank_order_id', originTankOrderId)
    .neq('status', 'cancelada')

  let queryNovo = supabase
    .from('ordens_envase_novo_fluxo')
    .select('id, quantidade, planning_status, status')
    .eq('origin_tank_order_id', originTankOrderId)
    .neq('status', 'cancelada')

  if (excludeOrderId) {
    queryLegacy = queryLegacy.neq('id', excludeOrderId)
    queryNovo = queryNovo.neq('id', excludeOrderId)
  }

  const [{ data: legacyData, error }, { data: novoData }] = await Promise.all([queryLegacy, queryNovo])
  if (error) return 0

  const somarRows = (rows: any[] | null) =>
    ((rows as any[]) ?? []).reduce((acc: number, row: any) => {
      if (isCanceled(normalizarPlanningStatus(row.planning_status), row.status)) return acc
      return acc + Number(row.quantidade || 0)
    }, 0)

  return somarRows(legacyData) + somarRows(novoData)
}

async function calcularBalanceamentoTanque(supabase: SupabaseClient, originTankOrderId: string, currentFillingLiters = 0, excludeOrderId?: string) {
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

async function validarConclusaoSemDivergencia({ supabase, ordem, requestedPlanningStatus }: {
  supabase: SupabaseClient
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

// GET /api/ordens
router.get('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const data = req.query.data as string | undefined
  const diasParam = req.query.dias as string | undefined
  const inicioParam = req.query.inicio as string | undefined
  const fimParam = req.query.fim as string | undefined

  if (data && !DATE_REGEX.test(data)) return res.status(400).json({ error: 'data invalida' })
  if (inicioParam && !DATE_REGEX.test(inicioParam)) return res.status(400).json({ error: 'inicio invalido' })
  if (fimParam && !DATE_REGEX.test(fimParam)) return res.status(400).json({ error: 'fim invalido' })
  if ((inicioParam && !fimParam) || (!inicioParam && fimParam)) {
    return res.status(400).json({ error: 'inicio e fim devem ser informados juntos' })
  }
  if (inicioParam && fimParam && inicioParam > fimParam) {
    return res.status(400).json({ error: 'inicio deve ser menor ou igual ao fim' })
  }

  let dias: number | null = null
  if (diasParam) {
    const parsed = Number(diasParam)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60) {
      return res.status(400).json({ error: 'dias invalido (use 1..60)' })
    }
    dias = parsed
  }

  let query = supabase
    .from('ordens')
    .select('*, produto:produtos(*), maquina:maquinas(*), tanque_ref:tanques(*)')
    .neq('status', 'cancelada')
    .order('inicio_agendado', { ascending: true, nullsFirst: false })

  if (inicioParam && fimParam) {
    query = query.or(
      `and(data_prevista.gte.${inicioParam},data_prevista.lte.${fimParam}),and(inicio_agendado.gte.${inicioParam}T00:00:00.000Z,inicio_agendado.lte.${fimParam}T23:59:59.999Z),and(fim_calculado.gte.${inicioParam}T00:00:00.000Z,fim_calculado.lte.${fimParam}T23:59:59.999Z)`
    )
  } else if (data && !dias) {
    query = query.or(
      `data_prevista.eq.${data},` +
      `and(inicio_agendado.gte.${data}T00:00:00.000Z,inicio_agendado.lte.${data}T23:59:59.999Z)`
    )
  }

  const { data: ordens, error } = await query
  if (error) return res.status(500).json({ error: mensagemErroOrdem(error.message) })

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
      `and(fim_calculado.gte.${inicioParam}T00:00:00.000Z,fim_calculado.lte.${fimParam}T23:59:59.999Z)`
    queryTanquesNovo = queryTanquesNovo.or(rangeFilter)
    queryEnvasesNovo = queryEnvasesNovo.or(rangeFilter)
  } else if (data && !dias) {
    const sameDayFilter =
      `data_prevista.eq.${data},` +
      `and(inicio_agendado.gte.${data}T00:00:00.000Z,inicio_agendado.lte.${data}T23:59:59.999Z)`
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

  if (tanquesNovoError) return res.status(500).json({ error: mensagemErroOrdem(tanquesNovoError.message) })
  if (envasesNovoError) return res.status(500).json({ error: mensagemErroOrdem(envasesNovoError.message) })

  const produtosMap = new Map(((produtosNovo as Produto[] | null) ?? []).map((p) => [p.sku, p]))
  const maquinasMap = new Map(((maquinasNovo as Maquina[] | null) ?? []).map((m) => [m.id, m]))
  const tanquesMap = new Map(((tanquesRefNovo as Tanque[] | null) ?? []).map((t) => [t.id, t]))

  lista = [
    ...lista,
    ...(((tanquesNovo as any[] | null) ?? []).map((ordem) => {
      const compat = parseCompatNotes(ordem.notes)
      const operacao = compat.operacao ?? {}
      return {
        ...ordem,
        inicio_operacao_em: ordem.inicio_operacao_em ?? operacao.inicio_operacao_em ?? null,
        fim_operacao_em: ordem.fim_operacao_em ?? operacao.fim_operacao_em ?? null,
        pausado_em: ordem.pausado_em ?? operacao.pausado_em ?? null,
        tempo_restante_pausado_seg: ordem.tempo_restante_pausado_seg ?? operacao.tempo_restante_pausado_seg ?? null,
        operador_nome: ordem.operador_nome ?? operacao.operador_nome ?? null,
        fim_estimado: operacao.fim_estimado ?? null,
        etapa: 'tanque',
        calc_mode: 'LITERS_MASTER',
        flow_source: 'novo_fluxo_tanque',
        produto: ordem.produto_sku ? produtosMap.get(ordem.produto_sku) ?? undefined : undefined,
        maquina: undefined,
        tanque_ref: ordem.tank_id ? tanquesMap.get(ordem.tank_id) ?? undefined : undefined,
      }
    })),
    ...(((envasesNovo as any[] | null) ?? []).map((ordem) => {
      const compat = parseCompatNotes(ordem.notes)
      const operacao = compat.operacao ?? {}
      return {
        ...ordem,
        inicio_operacao_em: ordem.inicio_operacao_em ?? operacao.inicio_operacao_em ?? null,
        fim_operacao_em: ordem.fim_operacao_em ?? operacao.fim_operacao_em ?? null,
        pausado_em: ordem.pausado_em ?? operacao.pausado_em ?? null,
        tempo_restante_pausado_seg: ordem.tempo_restante_pausado_seg ?? operacao.tempo_restante_pausado_seg ?? null,
        operador_nome: ordem.operador_nome ?? operacao.operador_nome ?? null,
        fim_estimado: operacao.fim_estimado ?? null,
        etapa: 'envase',
        flow_source: 'novo_fluxo_envase',
        produto: ordem.produto_sku ? produtosMap.get(ordem.produto_sku) ?? undefined : undefined,
        maquina: ordem.maquina_id ? maquinasMap.get(ordem.maquina_id) ?? undefined : undefined,
        tanque_ref: undefined,
      }
    })),
  ]

  lista = lista.filter((ordem) => {
    return !isCanceled(normalizarPlanningStatus(ordem.planning_status), ordem.status)
  })

  if (inicioParam && fimParam) {
    const inicioMs = new Date(`${inicioParam}T00:00:00`).getTime()
    const fimDate = new Date(`${fimParam}T00:00:00`)
    fimDate.setHours(23, 59, 59, 999)
    const fimMs = fimDate.getTime()

    lista = lista.filter((ordem) => {
      return (
        isDateOnlyInRange(ordem.data_prevista, inicioParam, fimParam) ||
        isDateInRange(ordem.inicio_agendado, inicioMs, fimMs) ||
        isDateInRange(ordem.fim_calculado, inicioMs, fimMs)
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
    }))
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

    for (const envase of ((envases as any[]) ?? [])) {
      if (!envase.origin_tank_order_id) continue
      if (isCanceled(normalizarPlanningStatus(envase.planning_status), envase.status)) continue
      const current = envasedByOrigin.get(envase.origin_tank_order_id) ?? 0
      envasedByOrigin.set(envase.origin_tank_order_id, current + Number(envase.quantidade || 0))
    }

    for (const envase of ((novosEnvasesDaOrigem as any[] | null) ?? [])) {
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
      fim_estimado: ordem.fim_estimado ?? operacaoCompat.fim_estimado ?? null,
      quantidade_referencia_litros: volumePorOrdem[ordem.id] ?? Number(ordem.quantidade),
    }

    if (ordem.etapa === 'tanque') {
      const litrosEnvasados = envasedByOrigin.get(ordem.id) ?? 0
      const balance = calculateTankVolumeBalance({ tankLiters: Number(ordem.quantidade || 0), alreadyFilledLiters: litrosEnvasados })
      enriched.origin_tank_liters = Number(ordem.quantidade || 0)
      enriched.origin_tank_filled_liters = litrosEnvasados
      enriched.origin_tank_delta_liters = balance.deltaLiters
      enriched.origin_tank_balance_status = balance.status
    } else if (ordem.origin_tank_order_id) {
      const litrosEnvasados = envasedByOrigin.get(ordem.origin_tank_order_id) ?? 0
      const origemNaLista = lista.find((item) => item.id === ordem.origin_tank_order_id)
      const litrosTanque = Number(origemNaLista?.quantidade ?? 0)
      if (litrosTanque > 0) {
        const balance = calculateTankVolumeBalance({ tankLiters: litrosTanque, alreadyFilledLiters: litrosEnvasados })
        enriched.origin_tank_liters = litrosTanque
        enriched.origin_tank_filled_liters = litrosEnvasados
        enriched.origin_tank_delta_liters = balance.deltaLiters
        enriched.origin_tank_balance_status = balance.status
      }
    }

    return enriched
  })

  return res.json(comVolume)
})

// PATCH /api/ordens
router.patch('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body

  const id = normalizarTexto(body.id)
  if (!id) return res.status(400).json({ error: 'id obrigatorio' })

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
    .from('ordens').select('*').eq('id', id).maybeSingle()
  if (ordemError) return res.status(400).json({ error: mensagemErroOrdem(ordemError.message) })

  if (!ordemData) {
    // Fallback: check new flow tables and apply a simplified update
    const { data: novoTanque } = await supabase.from('ordens_tanque_novo_fluxo').select('id').eq('id', id).maybeSingle()
    const novoFluxoTable = novoTanque
      ? ('ordens_tanque_novo_fluxo' as const)
      : ((await supabase.from('ordens_envase_novo_fluxo').select('id').eq('id', id).maybeSingle()).data
          ? ('ordens_envase_novo_fluxo' as const)
          : null)

    if (!novoFluxoTable) return res.status(404).json({ error: 'Ordem nao encontrada' })

    const simpleUpdate: Record<string, unknown> = {}
    if (inicio_agendado === null) {
      simpleUpdate.inicio_agendado = null
      simpleUpdate.fim_calculado = null
      simpleUpdate.planning_status = 'BACKLOG'
    } else {
      if (inicio_agendado !== undefined) {
        simpleUpdate.inicio_agendado = inicio_agendado
        simpleUpdate.data_prevista = inicio_agendado.slice(0, 10)
      }
      if (fim_calculado !== undefined) simpleUpdate.fim_calculado = fim_calculado || null
      if (body.planning_status !== undefined) {
        const ps = normalizarPlanningStatus(body.planning_status)
        if (ps) simpleUpdate.planning_status = ps
      }
      if (body.maquina_id !== undefined) simpleUpdate.maquina_id = normalizarTexto(body.maquina_id)
      if (body.tank_id !== undefined) simpleUpdate.tank_id = normalizarTexto(body.tank_id)
      for (const key of ['color', 'notes', 'lote', 'tanque'] as const) {
        if (metaUpdates[key] !== undefined) simpleUpdate[key] = metaUpdates[key]
      }
    }

    if (Object.keys(simpleUpdate).length === 0) return res.status(422).json({ error: 'nenhuma alteracao enviada' })

    const { data: updatedNovo, error: updateError } = await supabase
      .from(novoFluxoTable).update(simpleUpdate).eq('id', id).select('*').single()
    if (updateError) return res.status(400).json({ error: mensagemErroOrdem(updateError.message) })
    const flowSource = novoFluxoTable === 'ordens_tanque_novo_fluxo' ? 'novo_fluxo_tanque' : 'novo_fluxo_envase'
    return res.json({ ...updatedNovo, flow_source: flowSource })
  }

  const etapa = normalizarEtapa(metaUpdates.etapa ?? ordemData.etapa, ordemData.produto_sku, ordemData.unidade)
  const originTankOrderId = normalizarTexto(metaUpdates.origin_tank_order_id ?? ordemData.origin_tank_order_id)
  const requestedPlanningStatus = normalizarPlanningStatus(metaUpdates.planning_status ?? ordemData.planning_status)

  if (inicio_agendado === undefined && body.maquina_id === undefined && body.machine_id === undefined) {
    if (Object.keys(metaUpdates).length === 0) return res.status(422).json({ error: 'nenhuma alteracao enviada' })

    if (etapa === 'envase') {
      if (!originTankOrderId) return res.status(422).json({ error: 'Origem de tanque obrigatoria para envase' })
      const origem = await carregarOrigemTanque(supabase, originTankOrderId)
      if (!origem || origem.etapa !== 'tanque') {
        return res.status(422).json({ error: 'Origem de tanque invalida para envase' })
      }
    }

    const conclusaoError = await validarConclusaoSemDivergencia({
      supabase,
      ordem: { ...(ordemData as Ordem), etapa, origin_tank_order_id: originTankOrderId },
      requestedPlanningStatus,
    })
    if (conclusaoError) return res.status(422).json({ error: conclusaoError })

    const { data: updated, error } = await supabase.from('ordens').update(metaUpdates).eq('id', id).select('*').single()
    if (error) return res.status(400).json({ error: mensagemErroOrdem(error.message) })
    return res.json(updated)
  }

  if (inicio_agendado === null) {
    const { data: updated, error } = await supabase
      .from('ordens')
      .update({ maquina_id: null, tank_id: null, inicio_agendado: null, fim_calculado: null, planning_status: 'BACKLOG', ...metaUpdates })
      .eq('id', id).select('*').single()
    if (error) return res.status(400).json({ error: mensagemErroOrdem(error.message) })
    return res.json(updated)
  }

  if (!inicio_agendado) return res.status(422).json({ error: 'inicio_agendado obrigatorio' })

  const resourceTankId = tank_id ?? normalizarTexto(ordemData.tank_id)
  const resourceMachineId = maquina_id ?? normalizarTexto(ordemData.maquina_id)

  if (etapa === 'tanque' && !resourceTankId) {
    return res.status(422).json({ error: 'tank_id e obrigatorio para producao em tanque' })
  }
  if (etapa === 'envase') {
    if (!resourceMachineId) return res.status(422).json({ error: 'maquina_id e obrigatorio para envase' })
    if (!originTankOrderId) return res.status(422).json({ error: 'Origem de tanque obrigatoria para envase' })
  }

  const calcMode = normalizarCalcMode(metaUpdates.calc_mode ?? body.calc_mode ?? ordemData.calc_mode)
  const packageVolumeLiters = normalizarNumero(metaUpdates.package_volume_liters ?? body.package_volume_liters ?? ordemData.package_volume_liters)
  const unitsPerBox = normalizarInteiro(metaUpdates.units_per_box ?? body.units_per_box ?? ordemData.units_per_box) ?? 1
  const inputBoxes = normalizarInteiro(metaUpdates.estimated_boxes ?? body.estimated_boxes ?? ordemData.estimated_boxes)

  let litros = Number(body.liters ?? ordemData.quantidade ?? 0)
  if (calcMode === 'BOXES_MASTER' && inputBoxes !== null && packageVolumeLiters !== null && unitsPerBox > 0) {
    litros = calculateLitersFromBoxes({ boxes: inputBoxes, packageVolumeLiters, unitsPerBox })
  }
  if (!Number.isFinite(litros) || litros <= 0) return res.status(422).json({ error: 'Litros invalido' })

  const setupTimeMinutes = normalizarInteiro(metaUpdates.setup_time_minutes ?? ordemData.setup_time_minutes) ?? 0
  const rawProductionTimeMinutes = normalizarInteiro(metaUpdates.production_time_minutes ?? ordemData.production_time_minutes) ?? 0
  const cleaningTimeMinutes = normalizarInteiro(metaUpdates.cleaning_time_minutes ?? ordemData.cleaning_time_minutes) ?? 0
  const totalDurationFallback = normalizarInteiro(ordemData.total_duration_minutes) ?? 0
  const productionTimeMinutes = rawProductionTimeMinutes > 0
    ? rawProductionTimeMinutes
    : Math.max(0, totalDurationFallback - setupTimeMinutes - cleaningTimeMinutes)
  if (setupTimeMinutes < 0 || productionTimeMinutes <= 0 || cleaningTimeMinutes < 0) {
    return res.status(422).json({ error: 'Defina o tempo de producao da ordem antes de agendar.' })
  }
  if (packageVolumeLiters !== null && packageVolumeLiters <= 0) {
    return res.status(422).json({ error: 'packageVolumeLiters deve ser maior que zero' })
  }
  if (unitsPerBox <= 0) return res.status(422).json({ error: 'unitsPerBox deve ser maior que zero' })

  const tanqueVolumeFromTable = await carregarVolumeTanque(supabase, resourceTankId)
  const tankVolumeLiters = normalizarNumero(metaUpdates.tank_volume_liters ?? tanqueVolumeFromTable ?? ordemData.tank_volume_liters)
  if (etapa === 'tanque' && resourceTankId && tankVolumeLiters !== null && !validateTankCapacity(litros, tankVolumeLiters)) {
    return res.status(422).json({ error: 'Volume planejado ultrapassa a capacidade do tanque selecionado' })
  }

  let origemTanque: any | null = null
  if (etapa === 'envase' && originTankOrderId) {
    origemTanque = await carregarOrigemTanque(supabase, originTankOrderId)
    if (!origemTanque || origemTanque.etapa !== 'tanque') return res.status(422).json({ error: 'Origem de tanque invalida para envase' })
  }

  const inicio = new Date(inicio_agendado)
  if (!Number.isFinite(inicio.getTime())) return res.status(422).json({ error: 'inicio_agendado invalido' })
  if (isScheduleStartInPast(inicio)) return res.status(422).json({ error: SCHEDULE_IN_PAST_ERROR })

  const totalDurationMinutes = Math.max(1, calculateTotalDuration({ setupTimeMinutes, productionTimeMinutes, cleaningTimeMinutes }))
  const fimManual = typeof fim_calculado === 'string' ? new Date(fim_calculado) : null
  const fim = fimManual && Number.isFinite(fimManual.getTime()) ? fimManual : calculateProductionEndTime(inicio, totalDurationMinutes)
  if (!Number.isFinite(fim.getTime()) || fim <= inicio) {
    return res.status(422).json({ error: 'fim_calculado deve ser maior que inicio_agendado' })
  }

  const { boxVolumeLiters, estimatedBoxes } = calculateEstimatedBoxes({ liters: litros, packageVolumeLiters: packageVolumeLiters ?? 0, unitsPerBox })

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
  if (conflict) return res.status(409).json({ error: 'Ja existe uma producao agendada nesse recurso para este horario.' })

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
  if (error) return res.status(400).json({ error: mensagemErroOrdem(error.message) })

  let volume_balance = null
  if (etapa === 'envase' && originTankOrderId) {
    volume_balance = await calcularBalanceamentoTanque(supabase, originTankOrderId, litros, id)
  }

  return res.json({ ...updated, volume_balance })
})

// POST /api/ordens
router.post('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body

  const unidade = String(body.unidade ?? 'L').toUpperCase()
  const etapa = normalizarEtapa(body.etapa ?? body.productionType, body.produto_sku, unidade)
  const calcMode = normalizarCalcMode(body.calc_mode)
  const packageVolumeLiters = normalizarNumero(body.package_volume_liters ?? body.packageVolumeLiters)
  const unitsPerBox = normalizarInteiro(body.units_per_box ?? body.unitsPerBox) ?? 1
  const inputBoxes = normalizarInteiro(body.estimated_boxes ?? body.estimatedBoxes)
  let liters = Number(body.liters ?? body.quantidade ?? 0)
  if (calcMode === 'BOXES_MASTER' && inputBoxes !== null && packageVolumeLiters !== null && unitsPerBox > 0) {
    liters = calculateLitersFromBoxes({ boxes: inputBoxes, packageVolumeLiters, unitsPerBox })
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
  if (resultado.erro) return res.status(422).json({ error: resultado.erro })

  const { data: produto } = await supabase.from('produtos').select('sku, cor').eq('sku', body.produto_sku).single()
  if (!produto) return res.status(404).json({ error: 'Produto nao encontrado' })

  let originTank: any | null = null
  if (etapa === 'envase') {
    originTank = await carregarOrigemTanque(supabase, originTankOrderId)
    if (!originTank || originTank.etapa !== 'tanque') {
      return res.status(422).json({ error: 'Origem de tanque invalida para envase' })
    }
    if (isCanceled(originTank.planning_status, originTank.status)) {
      return res.status(422).json({ error: 'Origem de tanque cancelada nao pode ser usada no envase' })
    }
  }

  const tanqueVolume = await carregarVolumeTanque(supabase, tankId)
  if (etapa === 'tanque' && tankId && tanqueVolume !== null && !validateTankCapacity(liters, tanqueVolume)) {
    return res.status(422).json({ error: 'Volume planejado ultrapassa a capacidade do tanque selecionado' })
  }

  const totalDurationMinutes = Math.max(1, calculateTotalDuration({ setupTimeMinutes, productionTimeMinutes, cleaningTimeMinutes }))
  const startAt = plannedStartAt ? new Date(plannedStartAt) : null
  if (startAt && !Number.isFinite(startAt.getTime())) {
    return res.status(422).json({ error: 'plannedStartAt invalido' })
  }
  if (startAt && isScheduleStartInPast(startAt)) {
    return res.status(422).json({ error: SCHEDULE_IN_PAST_ERROR })
  }

  if (startAt && etapa === 'tanque' && !tankId) {
    return res.status(422).json({ error: 'tank_id e obrigatorio para producao em tanque agendada' })
  }
  if (startAt && etapa === 'envase' && !machineId) {
    return res.status(422).json({ error: 'maquina_id e obrigatorio para envase agendado' })
  }

  const fim = startAt ? calculateProductionEndTime(startAt, totalDurationMinutes) : null
  const { boxVolumeLiters, estimatedBoxes } = calculateEstimatedBoxes({ liters, packageVolumeLiters: packageVolumeLiters ?? 0, unitsPerBox })

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
      return res.status(409).json({ error: 'Ja existe uma producao agendada nesse recurso para este horario.' })
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
      color: color ?? (produto as any).cor ?? null,
      origin_tank_order_id: originTankOrderId,
    })
    .select('*')
    .single()
  if (error) return res.status(400).json({ error: mensagemErroOrdem(error.message) })

  let volume_balance = null
  if (etapa === 'envase' && originTankOrderId) {
    volume_balance = await calcularBalanceamentoTanque(supabase, originTankOrderId, liters)
  }

  return res.status(201).json({ ...nova, volume_balance })
})

// GET /api/ordens/tanques-origem
router.get('/tanques-origem', async (_req: Request, res: Response) => {
  const supabase = createClient()

  const [
    { data: tankOrders, error: tankError },
    { data: fillingOrders, error: fillingError },
    { data: novoFluxoTanques, error: novoFluxoTanqueError },
    { data: novoFluxoEnvases, error: novoFluxoEnvaseError },
  ] = await Promise.all([
    supabase
      .from('ordens')
      .select('id, numero_externo, produto_sku, lote, quantidade, data_prevista, planning_status, status')
      .eq('etapa', 'tanque')
      .neq('status', 'cancelada'),
    supabase
      .from('ordens')
      .select('id, origin_tank_order_id, quantidade, planning_status, status')
      .eq('etapa', 'envase')
      .not('origin_tank_order_id', 'is', null)
      .neq('status', 'cancelada'),
    supabase
      .from('ordens_tanque_novo_fluxo')
      .select('id, numero_externo, produto_sku, lote, quantidade, data_prevista, planning_status, status')
      .neq('status', 'cancelada'),
    supabase
      .from('ordens_envase_novo_fluxo')
      .select('id, origin_tank_order_id, quantidade, planning_status, status')
      .not('origin_tank_order_id', 'is', null)
      .neq('status', 'cancelada'),
  ])

  if (tankError) return res.status(500).json({ error: tankError.message })
  if (fillingError) return res.status(500).json({ error: fillingError.message })
  if (novoFluxoTanqueError) return res.status(500).json({ error: novoFluxoTanqueError.message })
  if (novoFluxoEnvaseError) return res.status(500).json({ error: novoFluxoEnvaseError.message })

  const filledByOrigin = new Map<string, number>()
  for (const row of [...((fillingOrders as any[]) ?? []), ...((novoFluxoEnvases as any[]) ?? [])]) {
    if (!row.origin_tank_order_id) continue
    if (isCanceled(normalizarPlanningStatus(row.planning_status), row.status)) continue
    const current = filledByOrigin.get(row.origin_tank_order_id) ?? 0
    filledByOrigin.set(row.origin_tank_order_id, current + Number(row.quantidade || 0))
  }

  const allTanks = [
    ...((tankOrders as any[]) ?? []).map((t: any) => ({ ...t, flow_source: 'legado' })),
    ...((novoFluxoTanques as any[]) ?? []).map((t: any) => ({ ...t, flow_source: 'novo_fluxo_tanque' })),
  ]

  const eligible = allTanks
    .filter((order) => !isCanceled(normalizarPlanningStatus(order.planning_status), order.status))
    .map((order) => {
      const litrosTanque = Number(order.quantidade || 0)
      const litrosEnvasados = filledByOrigin.get(order.id) ?? 0
      const balance = calculateTankVolumeBalance({
        tankLiters: litrosTanque,
        alreadyFilledLiters: litrosEnvasados,
        tolerance: VOLUME_BALANCE_TOLERANCE_LITERS,
      })
      return {
        id: order.id,
        numero_externo: order.numero_externo,
        produto_sku: order.produto_sku,
        lote: order.lote,
        litros_tanque: litrosTanque,
        litros_envasados: litrosEnvasados,
        saldo_litros: balance.deltaLiters,
        balance_status: balance.status,
        planning_status: order.planning_status ?? null,
        data_prevista: order.data_prevista,
        flow_source: order.flow_source,
      }
    })
    .filter((item) => item.saldo_litros > VOLUME_BALANCE_TOLERANCE_LITERS)
    .sort((a, b) => {
      if (a.data_prevista && b.data_prevista) return a.data_prevista.localeCompare(b.data_prevista)
      if (a.data_prevista) return -1
      if (b.data_prevista) return 1
      return a.numero_externo.localeCompare(b.numero_externo)
    })

  return res.json(eligible)
})

// POST /api/ordens/operacao
router.post('/operacao', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body as {
    ordem_id?: string
    acao?: unknown
    operador_id?: string
    operador_nome?: string
    observacao_pausa?: string
    flow_source?: FlowSource
  }

  type AcaoOperacao = 'iniciar' | 'pausar' | 'retomar' | 'finalizar'
  type ResourceType = 'machine' | 'tank'
  type SourceTable = 'ordens' | 'ordens_tanque_novo_fluxo' | 'ordens_envase_novo_fluxo'

  function validarAcao(valor: unknown): valor is AcaoOperacao {
    return valor === 'iniciar' || valor === 'pausar' || valor === 'retomar' || valor === 'finalizar'
  }

  function validarSource(valor: unknown): valor is FlowSource {
    return valor === 'legado' || valor === 'novo_fluxo_tanque' || valor === 'novo_fluxo_envase'
  }

  function isFinalized(status: string | null, planningStatus: PlanningStatus | null): boolean {
    return status === 'concluida' || planningStatus === 'COMPLETED'
  }

  function isInProduction(status: string | null, planningStatus: PlanningStatus | null): boolean {
    return status === 'produzindo' || planningStatus === 'IN_PRODUCTION'
  }

  function isPaused(status: string | null, planningStatus: PlanningStatus | null): boolean {
    return status === 'pausada' || planningStatus === 'PAUSED'
  }

  function minutosEntre(inicioIso: string | null, fimIso: string | null): number | null {
    if (!inicioIso || !fimIso) return null
    const inicioMs = new Date(inicioIso).getTime()
    const fimMs = new Date(fimIso).getTime()
    if (!Number.isFinite(inicioMs) || !Number.isFinite(fimMs)) return null
    const diff = (fimMs - inicioMs) / 60000
    return diff > 0 ? diff : null
  }


  function hydrateOperationalState(row: any): any {
    const compat = parseCompatNotes(row.notes)
    const operacao = compat.operacao ?? {}
    return {
      ...row,
      maquina_id: row.maquina_id ?? null,
      tank_id: row.tank_id ?? null,
      // Coluna direta tem prioridade; JSON serve de fallback para registros antigos
      inicio_operacao_em: row.inicio_operacao_em ?? operacao.inicio_operacao_em ?? null,
      fim_operacao_em: row.fim_operacao_em ?? operacao.fim_operacao_em ?? null,
      pausado_em: row.pausado_em ?? operacao.pausado_em ?? null,
      tempo_restante_pausado_seg: row.tempo_restante_pausado_seg ?? operacao.tempo_restante_pausado_seg ?? null,
      operador_id: operacao.operador_id ?? null,
      operador_nome: row.operador_nome ?? operacao.operador_nome ?? null,
      observacao_pausa: operacao.observacao_pausa ?? null,
      fim_estimado: operacao.fim_estimado ?? null,
      origin_tank_order_id: row.origin_tank_order_id ?? null,
      origin_tank_source: row.origin_tank_source ?? null,
      produto: null,
    }
  }

  async function loadLegacyOrder(ordemId: string) {
    const { data, error } = await supabase
      .from('ordens')
      .select('*')
      .eq('id', ordemId)
      .maybeSingle()
    if (error || !data) return null
    const raw = data as any
    const compat = parseCompatNotes(raw.notes)
    const operacao = compat.operacao ?? {}

    // Load product data separately to avoid FK-join failures
    let produto: any = null
    if (raw.produto_sku) {
      const { data: prodData } = await supabase
        .from('produtos')
        .select('volume_base, tempos_maquinas')
        .eq('sku', raw.produto_sku)
        .maybeSingle()
      produto = prodData ?? null
    }

    return {
      ...raw,
      operador_id: operacao.operador_id ?? null,
      observacao_pausa: operacao.observacao_pausa ?? null,
      fim_estimado: operacao.fim_estimado ?? null,
      produto,
    }
  }

  async function loadNewTankOrder(ordemId: string) {
    const { data, error } = await supabase
      .from('ordens_tanque_novo_fluxo')
      .select('*')
      .eq('id', ordemId).maybeSingle()
    if (error || !data) return null
    return hydrateOperationalState({ ...(data as any), maquina_id: null, origin_tank_order_id: null })
  }

  async function loadNewEnvaseOrder(ordemId: string) {
    const { data, error } = await supabase
      .from('ordens_envase_novo_fluxo')
      .select('*')
      .eq('id', ordemId).maybeSingle()
    if (error || !data) return null
    return hydrateOperationalState({ ...(data as any), tank_id: null })
  }

  async function resolveOrder(ordemId: string, source?: FlowSource) {
    if (source === 'legado') {
      const ordem = await loadLegacyOrder(ordemId)
      return ordem ? { ordem, source: 'legado' as FlowSource, table: 'ordens' as SourceTable, isLegacy: true } : null
    }
    if (source === 'novo_fluxo_tanque') {
      const ordem = await loadNewTankOrder(ordemId)
      return ordem ? { ordem, source: 'novo_fluxo_tanque' as FlowSource, table: 'ordens_tanque_novo_fluxo' as SourceTable, isLegacy: false } : null
    }
    if (source === 'novo_fluxo_envase') {
      const ordem = await loadNewEnvaseOrder(ordemId)
      return ordem ? { ordem, source: 'novo_fluxo_envase' as FlowSource, table: 'ordens_envase_novo_fluxo' as SourceTable, isLegacy: false } : null
    }
    const legado = await loadLegacyOrder(ordemId)
    if (legado) return { ordem: legado, source: 'legado' as FlowSource, table: 'ordens' as SourceTable, isLegacy: true }
    const novoTanque = await loadNewTankOrder(ordemId)
    if (novoTanque) return { ordem: novoTanque, source: 'novo_fluxo_tanque' as FlowSource, table: 'ordens_tanque_novo_fluxo' as SourceTable, isLegacy: false }
    const novoEnvase = await loadNewEnvaseOrder(ordemId)
    if (novoEnvase) return { ordem: novoEnvase, source: 'novo_fluxo_envase' as FlowSource, table: 'ordens_envase_novo_fluxo' as SourceTable, isLegacy: false }
    return null
  }

  async function hasOperationalConflictOnResource(resourceType: ResourceType, resourceId: string, currentId: string, currentSource: FlowSource) {
    const activeStatuses = ['IN_PRODUCTION', 'PAUSED']
    if (resourceType === 'machine') {
      const [{ data: legacy }, { data: novo }] = await Promise.all([
        supabase.from('ordens').select('id').eq('etapa', 'envase').eq('maquina_id', resourceId).in('planning_status', activeStatuses),
        supabase.from('ordens_envase_novo_fluxo').select('id').eq('maquina_id', resourceId).in('planning_status', activeStatuses),
      ])
      const legacyConflict = (legacy ?? []).some((row: any) => !(currentSource === 'legado' && row.id === currentId))
      const novoConflict = (novo ?? []).some((row: any) => !(currentSource === 'novo_fluxo_envase' && row.id === currentId))
      return legacyConflict || novoConflict
    }
    const [{ data: legacy }, { data: novo }] = await Promise.all([
      supabase.from('ordens').select('id').eq('etapa', 'tanque').eq('tank_id', resourceId).in('planning_status', activeStatuses),
      supabase.from('ordens_tanque_novo_fluxo').select('id').eq('tank_id', resourceId).in('planning_status', activeStatuses),
    ])
    const legacyConflict = (legacy ?? []).some((row: any) => !(currentSource === 'legado' && row.id === currentId))
    const novoConflict = (novo ?? []).some((row: any) => !(currentSource === 'novo_fluxo_tanque' && row.id === currentId))
    return legacyConflict || novoConflict
  }

  async function validarOrigemTanqueConcluida(resolution: { ordem: any; source: FlowSource }) {
    const { ordem, source } = resolution
    if (ordem.etapa !== 'envase' || !ordem.origin_tank_order_id) return null
    if (source === 'novo_fluxo_envase' && ordem.origin_tank_source === 'novo_fluxo') {
      const { data } = await supabase.from('ordens_tanque_novo_fluxo').select('planning_status, status').eq('id', ordem.origin_tank_order_id).maybeSingle()
      if (!data) return 'Ordem de tanque de origem nao encontrada.'
      if (data.status === 'cancelada' || data.planning_status === 'CANCELED') return 'Ordem de tanque cancelada nao pode liberar envase.'
      if (data.planning_status !== 'COMPLETED') return 'So e possivel iniciar o envase quando a ordem do tanque estiver concluida.'
      return null
    }
    const { data } = await supabase.from('ordens').select('planning_status, status').eq('id', ordem.origin_tank_order_id).maybeSingle()
    if (!data) return 'Ordem de tanque de origem nao encontrada.'
    if (data.status === 'cancelada' || data.planning_status === 'CANCELED') return 'Ordem de tanque cancelada nao pode liberar envase.'
    if (data.planning_status !== 'COMPLETED') return 'So e possivel iniciar o envase quando a ordem do tanque estiver concluida.'
    return null
  }

  async function updateOrder(resolution: { ordem: any; source: FlowSource; table: SourceTable; isLegacy: boolean }, updates: Record<string, unknown>) {
    const compatOperacao: any = {
      inicio_operacao_em: typeof updates.inicio_operacao_em === 'string' ? updates.inicio_operacao_em : resolution.ordem.inicio_operacao_em ?? null,
      fim_operacao_em: typeof updates.fim_operacao_em === 'string' ? updates.fim_operacao_em : updates.fim_operacao_em === null ? null : resolution.ordem.fim_operacao_em ?? null,
      pausado_em: typeof updates.pausado_em === 'string' ? updates.pausado_em : updates.pausado_em === null ? null : resolution.ordem.pausado_em ?? null,
      tempo_restante_pausado_seg: typeof updates.tempo_restante_pausado_seg === 'number' ? updates.tempo_restante_pausado_seg : updates.tempo_restante_pausado_seg === null ? null : resolution.ordem.tempo_restante_pausado_seg ?? null,
      operador_id: typeof updates.operador_id === 'string' ? updates.operador_id : updates.operador_id === null ? null : resolution.ordem.operador_id ?? null,
      operador_nome: typeof updates.operador_nome === 'string' ? updates.operador_nome : resolution.ordem.operador_nome ?? null,
      observacao_pausa: typeof updates.observacao_pausa === 'string' ? updates.observacao_pausa : updates.observacao_pausa === null ? null : resolution.ordem.observacao_pausa ?? null,
      // Fim estimado operacional (timer ao vivo). Vive apenas no JSON `notes`, fora das
      // colunas de agendamento — empurrado a cada retomada de pausa.
      fim_estimado: typeof updates.fim_estimado === 'string' ? updates.fim_estimado : updates.fim_estimado === null ? null : resolution.ordem.fim_estimado ?? null,
    }

    if (!resolution.isLegacy) {
      const compatUpdates: Record<string, unknown> = {
        status: updates.status,
        planning_status: updates.planning_status,
        // Janela de agendamento (inicio_agendado/fim_calculado) NUNCA e tocada pela operacao —
        // preserva "Inicio previsto", "Fim previsto" planejado e a posicao no calendario.
        // Grava nas colunas diretas para consistência com o banco e com o monitoramento
        inicio_operacao_em: compatOperacao.inicio_operacao_em,
        fim_operacao_em: compatOperacao.fim_operacao_em,
        pausado_em: compatOperacao.pausado_em,
        tempo_restante_pausado_seg: compatOperacao.tempo_restante_pausado_seg,
        operador_nome: compatOperacao.operador_nome,
        // notes mantido como fallback e para campos sem coluna (operador_id, observacao_pausa)
        notes: mergeCompatNotes(resolution.ordem.notes, compatOperacao),
      }
      const { data, error } = await supabase.from(resolution.table).update(compatUpdates).eq('id', resolution.ordem.id).select('*').single()
      if (error || !data) return { error: error?.message ?? 'Erro ao atualizar ordem', data: null }
      const hydrated = resolution.source === 'novo_fluxo_tanque'
        ? hydrateOperationalState({ ...(data as any), maquina_id: null, origin_tank_order_id: null })
        : hydrateOperationalState({ ...(data as any), tank_id: null })
      return { error: null, data: hydrated }
    }

    const legacyUpdates: Record<string, unknown> = { ...updates }
    delete legacyUpdates.operador_id
    delete legacyUpdates.observacao_pausa
    // fim_estimado nao e coluna de `ordens`; persiste apenas via notes (mergeCompatNotes)
    delete legacyUpdates.fim_estimado
    legacyUpdates.notes = mergeCompatNotes(resolution.ordem.notes, compatOperacao)
    const { data, error } = await supabase.from(resolution.table).update(legacyUpdates).eq('id', resolution.ordem.id).select('*').single()
    if (error || !data) return { error: error?.message ?? 'Erro ao atualizar ordem', data: null }
    return { error: null, data }
  }

  async function registrarEvento(ordem: any, tipo: string, timestamp: string, operadorNome: string) {
    await supabase.from('eventos_timer').insert({
      ordem_id: ordem.id,
      maquina_id: ordem.maquina_id ?? null,
      tipo,
      timestamp,
      operador_nome: operadorNome,
    })
  }

  // Alias para compatibilidade — novos usos devem chamar registrarEvento
  const registrarEventoLegado = registrarEvento

  async function liberarEnvasesAguardando(resolution: { ordem: any; source: FlowSource }) {
    if (resolution.ordem.etapa !== 'tanque') return
    if (resolution.source === 'legado') {
      await Promise.all([
        supabase.from('ordens').update({ planning_status: 'SCHEDULED' }).eq('origin_tank_order_id', resolution.ordem.id).eq('etapa', 'envase').eq('planning_status', 'WAITING_TANK'),
        supabase.from('ordens_envase_novo_fluxo').update({ planning_status: 'SCHEDULED' }).eq('origin_tank_source', 'legado').eq('origin_tank_order_id', resolution.ordem.id).eq('planning_status', 'WAITING_TANK'),
      ])
      return
    }
    if (resolution.source === 'novo_fluxo_tanque') {
      await supabase.from('ordens_envase_novo_fluxo').update({ planning_status: 'SCHEDULED' }).eq('origin_tank_source', 'novo_fluxo').eq('origin_tank_order_id', resolution.ordem.id).eq('planning_status', 'WAITING_TANK')
    }
  }

  async function calcularDuracaoPlanejadaMinLegado(ordem: any): Promise<number> {
    const duracaoDaAgenda = minutosEntre(ordem.inicio_agendado, ordem.fim_calculado)
    if (duracaoDaAgenda) return duracaoDaAgenda
    if (ordem.total_duration_minutes && ordem.total_duration_minutes > 0) return ordem.total_duration_minutes
    if (!ordem.maquina_id || !ordem.produto) return 1
    let volumeReferencia = Number(ordem.quantidade || 0)
    if (ordem.lote) {
      const { data: ordensLote } = await supabase.from('ordens').select('id, quantidade, unidade, lote, etapa').eq('lote', ordem.lote)
      if (Array.isArray(ordensLote) && ordensLote.length > 0) {
        const map = mapearVolumeReferenciaPorOrdem(ordensLote as any[])
        volumeReferencia = obterVolumeReferenciaLitros({ id: ordem.id, quantidade: Number(ordem.quantidade || 0), unidade: ordem.unidade, lote: ordem.lote, etapa: ordem.etapa }, map)
      }
    }
    const tempos = ordem.produto.tempos_maquinas?.[ordem.maquina_id] || {}
    const setup = Number(tempos.setup ?? 0)
    const producao = Number(tempos.producao ?? 0)
    const calculado = calcularDuracao(volumeReferencia, Number(ordem.produto.volume_base || 3800), setup, producao)
    return calculado > 0 ? calculado : 1
  }

  // Main handler
  const ordemId = body.ordem_id?.trim()
  const acao = body.acao
  const observacaoPausa = body.observacao_pausa?.trim() ?? ''
  const requestedSource = validarSource(body.flow_source) ? body.flow_source : undefined

  if (!ordemId) return res.status(422).json({ error: 'ordem_id obrigatorio' })
  if (!validarAcao(acao)) return res.status(422).json({ error: 'acao invalida' })

  const operadorId = body.operador_id?.trim() ?? ''
  const operadorNomeDigitado = body.operador_nome?.trim() ?? ''
  let resolvedOperadorId: string | null = null
  let resolvedOperadorNome: string = ''

  if (operadorId) {
    const operador = await buscarOperadorPorId(operadorId)
    if (!operador || !operador.ativo) {
      return res.status(422).json({ error: 'Operador selecionado nao esta disponivel.' })
    }
    resolvedOperadorId = operador.id
    resolvedOperadorNome = operador.nome
  } else if (operadorNomeDigitado) {
    resolvedOperadorId = null
    resolvedOperadorNome = operadorNomeDigitado
  } else {
    return res.status(422).json({ error: 'operador_id obrigatorio' })
  }

  if (acao === 'pausar' && !observacaoPausa) {
    return res.status(422).json({ error: 'observacao_pausa obrigatoria para registrar a pausa.' })
  }

  const resolution = await resolveOrder(ordemId, requestedSource)
  if (!resolution) return res.status(404).json({ error: 'Ordem nao encontrada' })

  const { ordem } = resolution
  if (isCanceled(ordem.planning_status, ordem.status)) {
    return res.status(409).json({ error: 'Ordem cancelada nao pode ser movimentada.' })
  }
  if (isFinalized(ordem.status, ordem.planning_status)) {
    return res.status(409).json({ error: 'Ordem ja concluida.' })
  }

  const resourceId = ordem.etapa === 'tanque' ? ordem.tank_id : ordem.maquina_id
  const resourceType: ResourceType = ordem.etapa === 'tanque' ? 'tank' : 'machine'
  if (!resourceId) {
    return res.status(409).json({ error: 'A ordem precisa estar vinculada a um recurso para iniciar a producao.' })
  }

  const agora = new Date()
  const agoraIso = agora.toISOString()

  if (acao === 'iniciar') {
    if (isPaused(ordem.status, ordem.planning_status)) {
      return res.status(409).json({ error: 'A ordem esta pausada. Use retomar para continuar.' })
    }
    const erroOrigem = await validarOrigemTanqueConcluida(resolution)
    if (erroOrigem) return res.status(422).json({ error: erroOrigem })
    const conflito = await hasOperationalConflictOnResource(resourceType, resourceId, ordem.id, resolution.source)
    if (conflito) return res.status(409).json({ error: 'Ja existe outra ordem em andamento ou pausada nesse recurso.' })

    const durationMinutes = resolution.isLegacy
      ? await calcularDuracaoPlanejadaMinLegado(ordem)
      : Math.max(1, Number(ordem.total_duration_minutes || 1))

    const { data, error } = await updateOrder(resolution, buildIniciarUpdate({
      ordem, durationMinutes, now: agora,
      operadorId: resolvedOperadorId, operadorNome: resolvedOperadorNome,
    }))
    if (error) return res.status(400).json({ error })
    await registrarEvento(ordem, 'inicio', agoraIso, resolvedOperadorNome)
    return res.json({ ...data, flow_source: resolution.source })
  }

  if (acao === 'pausar') {
    if (!isInProduction(ordem.status, ordem.planning_status)) {
      return res.status(409).json({ error: 'Somente ordens em andamento podem ser pausadas.' })
    }

    const { data, error } = await updateOrder(resolution, buildPausarUpdate({
      ordem, now: agora,
      operadorId: resolvedOperadorId, operadorNome: resolvedOperadorNome,
      observacaoPausa,
    }))
    if (error) return res.status(400).json({ error })
    await registrarEvento(ordem, 'pausa', agoraIso, resolvedOperadorNome)
    return res.json({ ...data, flow_source: resolution.source })
  }

  if (acao === 'retomar') {
    if (!isPaused(ordem.status, ordem.planning_status)) {
      return res.status(409).json({ error: 'Somente ordens pausadas podem ser retomadas.' })
    }
    const erroOrigem = await validarOrigemTanqueConcluida(resolution)
    if (erroOrigem) return res.status(422).json({ error: erroOrigem })
    const conflito = await hasOperationalConflictOnResource(resourceType, resourceId, ordem.id, resolution.source)
    if (conflito) return res.status(409).json({ error: 'Ja existe outra ordem em andamento ou pausada nesse recurso.' })

    const { data, error } = await updateOrder(resolution, buildRetomarUpdate({
      ordem, now: agora,
      operadorId: resolvedOperadorId, operadorNome: resolvedOperadorNome,
    }))
    if (error) return res.status(400).json({ error })
    await registrarEvento(ordem, 'retomada', agoraIso, resolvedOperadorNome)
    return res.json({ ...data, flow_source: resolution.source })
  }

  // finalizar — registra o fim real (fim_operacao_em). fim_calculado permanece o planejado,
  // permitindo o calculo de atraso (real x planejado) no monitoramento.
  const { data, error } = await updateOrder(resolution, buildFinalizarUpdate({
    ordem, now: agora,
    operadorId: resolvedOperadorId, operadorNome: resolvedOperadorNome,
  }))
  if (error) return res.status(400).json({ error })
  await registrarEvento(ordem, 'conclusao', agoraIso, resolvedOperadorNome)
  await liberarEnvasesAguardando(resolution)
  return res.json({ ...data, flow_source: resolution.source })
})

export default router
