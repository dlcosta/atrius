import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'
import {
  calculateProductionEndTime,
  calculateTankVolumeBalance,
  calculateTotalDuration,
  hasScheduleConflict,
  validateTankCapacity,
  VOLUME_BALANCE_TOLERANCE_LITERS,
} from '../lib/planning/production'
import { isScheduleStartInPast, SCHEDULE_IN_PAST_ERROR } from '../lib/planning/schedule'
import type { Ordem } from '../types'

const router = Router()

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function isCanceled(planningStatus: string | null, status: string | null): boolean {
  return planningStatus === 'CANCELED' || status === 'cancelada'
}

// GET /api/novo-fluxo/tanques
router.get('/tanques', async (req: Request, res: Response) => {
  const supabase = createClient()
  const inicio = req.query.inicio as string | undefined
  const fim = req.query.fim as string | undefined

  if (inicio && !DATE_REGEX.test(inicio)) return res.status(400).json({ error: 'inicio invalido' })
  if (fim && !DATE_REGEX.test(fim)) return res.status(400).json({ error: 'fim invalido' })

  let query = supabase
    .from('ordens_tanque_novo_fluxo')
    .select('*')
    .order('inicio_agendado', { ascending: true })

  if (inicio && fim) {
    query = query.gte('data_prevista', inicio).lte('data_prevista', fim)
  } else if (inicio) {
    query = query.eq('data_prevista', inicio)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// POST /api/novo-fluxo/tanques
router.post('/tanques', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body as {
    numero_externo?: string
    produto_sku?: string
    liters?: number
    lote?: string | null
    tanque?: string | null
    tank_id?: string
    setup_time_minutes?: number
    production_time_minutes?: number
    cleaning_time_minutes?: number
    inicio_agendado?: string
    data_prevista?: string
    planning_status?: string
    color?: string | null
    notes?: string | null
  }

  if (!body.numero_externo?.trim()) return res.status(422).json({ error: 'numero_externo obrigatorio' })
  if (!body.produto_sku?.trim()) return res.status(422).json({ error: 'produto_sku obrigatorio' })
  if (!body.tank_id?.trim()) return res.status(422).json({ error: 'tank_id obrigatorio' })
  if (!body.inicio_agendado?.trim()) return res.status(422).json({ error: 'inicio_agendado obrigatorio' })
  if (!body.data_prevista?.trim() || !DATE_REGEX.test(body.data_prevista)) {
    return res.status(422).json({ error: 'data_prevista invalida' })
  }

  const liters = Number(body.liters ?? 0)
  const setupTimeMinutes = Math.max(0, Math.round(Number(body.setup_time_minutes ?? 0)))
  const productionTimeMinutes = Math.max(1, Math.round(Number(body.production_time_minutes ?? 0)))
  const cleaningTimeMinutes = Math.max(0, Math.round(Number(body.cleaning_time_minutes ?? 0)))
  if (!Number.isFinite(liters) || liters <= 0) return res.status(422).json({ error: 'liters deve ser maior que zero' })

  const startAt = new Date(body.inicio_agendado)
  if (!Number.isFinite(startAt.getTime())) return res.status(422).json({ error: 'inicio_agendado invalido' })
  if (isScheduleStartInPast(startAt)) return res.status(422).json({ error: SCHEDULE_IN_PAST_ERROR })

  const { data: produto } = await supabase
    .from('produtos')
    .select('sku, nome, cor')
    .eq('sku', body.produto_sku)
    .single()
  if (!produto) return res.status(404).json({ error: 'Produto nao encontrado' })

  const { data: tanque } = await supabase
    .from('tanques')
    .select('id, nome, volume_liters')
    .eq('id', body.tank_id)
    .single()
  if (!tanque) return res.status(404).json({ error: 'Tanque nao encontrado' })

  if (!validateTankCapacity(liters, Number((tanque as any).volume_liters || 0))) {
    return res.status(422).json({ error: 'Volume planejado ultrapassa a capacidade do tanque selecionado' })
  }

  const numeroExterno = body.numero_externo.trim()
  const { data: ordemExistente } = await supabase
    .from('ordens_tanque_novo_fluxo')
    .select('id')
    .eq('numero_externo', numeroExterno)
    .maybeSingle()
  if (ordemExistente) {
    return res.status(409).json({ error: 'Ja existe uma ordem de tanque com esse ID.' })
  }

  const totalDurationMinutes = Math.max(
    1,
    calculateTotalDuration({ setupTimeMinutes, productionTimeMinutes, cleaningTimeMinutes })
  )
  const endAt = calculateProductionEndTime(startAt, totalDurationMinutes)

  const { data: existentes } = await supabase.from('ordens_tanque_novo_fluxo').select('*')
  const hasConflict = hasScheduleConflict({
    productionType: 'TANK',
    tankId: body.tank_id,
    newStart: startAt,
    newEnd: endAt,
    existingSchedules: ((existentes as any[] | null) ?? []).map((row: any) => ({
      id: row.id,
      numero_externo: row.numero_externo,
      produto_sku: row.produto_sku,
      maquina_id: null,
      quantidade: Number(row.quantidade || 0),
      unidade: row.unidade,
      tanque: row.tanque,
      lote: row.lote,
      etapa: 'tanque' as const,
      tank_id: row.tank_id,
      tank_volume_liters: row.tank_volume_liters,
      setup_time_minutes: row.setup_time_minutes,
      production_time_minutes: row.production_time_minutes,
      cleaning_time_minutes: row.cleaning_time_minutes,
      total_duration_minutes: row.total_duration_minutes,
      planning_status: row.planning_status,
      color: row.color,
      data_prevista: row.data_prevista,
      inicio_agendado: row.inicio_agendado,
      fim_calculado: row.fim_calculado,
      status: row.status,
      sincronizado_em: row.inicio_agendado,
    } as Ordem)),
  })
  if (hasConflict) {
    return res.status(409).json({ error: 'Ja existe uma producao agendada nesse tanque para este horario.' })
  }

  const { data: nova, error } = await supabase
    .from('ordens_tanque_novo_fluxo')
    .insert({
      numero_externo: numeroExterno,
      produto_sku: body.produto_sku,
      quantidade: liters,
      unidade: 'L',
      tanque: (tanque as any).nome,
      lote: body.lote?.trim() || null,
      etapa: 'tanque',
      tank_id: (tanque as any).id,
      tank_volume_liters: (tanque as any).volume_liters,
      setup_time_minutes: setupTimeMinutes,
      production_time_minutes: productionTimeMinutes,
      cleaning_time_minutes: cleaningTimeMinutes,
      total_duration_minutes: totalDurationMinutes,
      inicio_agendado: startAt.toISOString(),
      fim_calculado: endAt.toISOString(),
      planning_status: body.planning_status?.trim() || 'SCHEDULED',
      color: body.color?.trim() || (produto as any).cor || null,
      notes: body.notes?.trim() || null,
      data_prevista: body.data_prevista,
      status: 'aguardando',
    })
    .select('*')
    .single()

  if (error || !nova) return res.status(400).json({ error: error?.message ?? 'Erro ao criar ordem de tanque' })
  return res.status(201).json(nova)
})

// GET /api/novo-fluxo/tanques/origens
router.get('/tanques/origens', async (_req: Request, res: Response) => {
  const supabase = createClient()

  const [
    { data: novosTanques },
    { data: novosEnvases },
    { data: tanquesLegado },
    { data: envasesLegado },
  ] = await Promise.all([
    supabase
      .from('ordens_tanque_novo_fluxo')
      .select('id, numero_externo, produto_sku, lote, quantidade, data_prevista, planning_status, status')
      .neq('status', 'cancelada'),
    supabase
      .from('ordens_envase_novo_fluxo')
      .select('origin_tank_source, origin_tank_order_id, quantidade, planning_status, status'),
    supabase
      .from('ordens')
      .select('id, numero_externo, produto_sku, lote, quantidade, data_prevista, planning_status, status')
      .eq('etapa', 'tanque')
      .neq('status', 'cancelada'),
    supabase
      .from('ordens')
      .select('origin_tank_order_id, quantidade, planning_status, status')
      .eq('etapa', 'envase')
      .not('origin_tank_order_id', 'is', null)
      .neq('status', 'cancelada'),
  ])

  const filledNew = new Map<string, number>()
  for (const row of (novosEnvases as any[] | null) ?? []) {
    if (row.origin_tank_source !== 'novo_fluxo') continue
    if (isCanceled(row.planning_status, row.status)) continue
    filledNew.set(row.origin_tank_order_id, (filledNew.get(row.origin_tank_order_id) ?? 0) + Number(row.quantidade || 0))
  }

  const filledLegacy = new Map<string, number>()
  for (const row of (envasesLegado as any[] | null) ?? []) {
    if (!row.origin_tank_order_id) continue
    if (isCanceled(row.planning_status, row.status)) continue
    filledLegacy.set(row.origin_tank_order_id, (filledLegacy.get(row.origin_tank_order_id) ?? 0) + Number(row.quantidade || 0))
  }
  for (const row of (novosEnvases as any[] | null) ?? []) {
    if (row.origin_tank_source !== 'legado') continue
    if (isCanceled(row.planning_status, row.status)) continue
    filledLegacy.set(row.origin_tank_order_id, (filledLegacy.get(row.origin_tank_order_id) ?? 0) + Number(row.quantidade || 0))
  }

  const novoFluxo = ((novosTanques as any[] | null) ?? [])
    .map((row) => {
      const litrosEnvasados = filledNew.get(row.id) ?? 0
      const balance = calculateTankVolumeBalance({
        tankLiters: Number(row.quantidade || 0),
        alreadyFilledLiters: litrosEnvasados,
        tolerance: VOLUME_BALANCE_TOLERANCE_LITERS,
      })
      return {
        id: row.id,
        source: 'novo_fluxo' as const,
        numero_externo: row.numero_externo,
        produto_sku: row.produto_sku,
        lote: row.lote,
        litros_tanque: Number(row.quantidade || 0),
        litros_envasados: litrosEnvasados,
        saldo_litros: balance.deltaLiters,
        balance_status: balance.status,
        planning_status: row.planning_status,
        data_prevista: row.data_prevista,
      }
    })
    .filter((item) => item.saldo_litros > VOLUME_BALANCE_TOLERANCE_LITERS)

  const legado = ((tanquesLegado as any[] | null) ?? [])
    .map((row) => {
      const litrosEnvasados = filledLegacy.get(row.id) ?? 0
      const balance = calculateTankVolumeBalance({
        tankLiters: Number(row.quantidade || 0),
        alreadyFilledLiters: litrosEnvasados,
        tolerance: VOLUME_BALANCE_TOLERANCE_LITERS,
      })
      return {
        id: row.id,
        source: 'legado' as const,
        numero_externo: row.numero_externo,
        produto_sku: row.produto_sku,
        lote: row.lote,
        litros_tanque: Number(row.quantidade || 0),
        litros_envasados: litrosEnvasados,
        saldo_litros: balance.deltaLiters,
        balance_status: balance.status,
        planning_status: row.planning_status,
        data_prevista: row.data_prevista,
      }
    })
    .filter((item) => item.saldo_litros > VOLUME_BALANCE_TOLERANCE_LITERS)

  return res.json(
    [...novoFluxo, ...legado].sort((a, b) => {
      const aData = a.data_prevista ?? ''
      const bData = b.data_prevista ?? ''
      return aData.localeCompare(bData) || a.numero_externo.localeCompare(b.numero_externo)
    })
  )
})

// GET /api/novo-fluxo/envase
router.get('/envase', async (req: Request, res: Response) => {
  const supabase = createClient()
  const inicio = req.query.inicio as string | undefined
  const fim = req.query.fim as string | undefined

  if (inicio && !DATE_REGEX.test(inicio)) return res.status(400).json({ error: 'inicio invalido' })
  if (fim && !DATE_REGEX.test(fim)) return res.status(400).json({ error: 'fim invalido' })

  let query = supabase
    .from('ordens_envase_novo_fluxo')
    .select('*')
    .order('inicio_agendado', { ascending: true })

  if (inicio && fim) {
    query = query.gte('data_prevista', inicio).lte('data_prevista', fim)
  } else if (inicio) {
    query = query.eq('data_prevista', inicio)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// POST /api/novo-fluxo/envase
router.post('/envase', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body as {
    produto_sku?: string
    origin_tank_order_id?: string
    origin_tank_source?: 'novo_fluxo' | 'legado'
    maquina_id?: string
    data_prevista?: string
    inicio_agendado?: string
    nome_produto?: string
    embalagem_label?: string
    package_volume_liters?: number
    units_per_box?: number
    quantidade_embalagens?: number
    quantidade_unidades_avulsas?: number
    total_unidades?: number
    total_litros?: number
    production_time_minutes?: number
    cleaning_time_minutes?: number
  }

  if (!body.produto_sku?.trim()) return res.status(422).json({ error: 'produto_sku obrigatorio' })
  if (!body.origin_tank_order_id?.trim()) return res.status(422).json({ error: 'origin_tank_order_id obrigatorio' })
  if (!body.maquina_id?.trim()) return res.status(422).json({ error: 'maquina_id obrigatorio' })
  if (!body.data_prevista?.trim() || !DATE_REGEX.test(body.data_prevista)) return res.status(422).json({ error: 'data_prevista invalida' })
  if (!body.inicio_agendado?.trim()) return res.status(422).json({ error: 'inicio_agendado obrigatorio' })
  if (!body.nome_produto?.trim()) return res.status(422).json({ error: 'nome_produto obrigatorio' })
  if (!body.embalagem_label?.trim()) return res.status(422).json({ error: 'embalagem_label obrigatoria' })
  if (!Number.isFinite(Number(body.package_volume_liters)) || Number(body.package_volume_liters) <= 0) return res.status(422).json({ error: 'package_volume_liters deve ser maior que zero' })
  if (!Number.isFinite(Number(body.units_per_box)) || Number(body.units_per_box) <= 0) return res.status(422).json({ error: 'units_per_box deve ser maior que zero' })
  if (!Number.isFinite(Number(body.total_unidades)) || Number(body.total_unidades) <= 0) return res.status(422).json({ error: 'total_unidades deve ser maior que zero' })
  if (!Number.isFinite(Number(body.total_litros)) || Number(body.total_litros) <= 0) return res.status(422).json({ error: 'total_litros deve ser maior que zero' })
  if (!Number.isFinite(Number(body.production_time_minutes)) || Number(body.production_time_minutes) <= 0) return res.status(422).json({ error: 'production_time_minutes deve ser maior que zero' })
  if (!Number.isFinite(Number(body.cleaning_time_minutes)) || Number(body.cleaning_time_minutes) < 0) return res.status(422).json({ error: 'cleaning_time_minutes deve ser maior ou igual a zero' })

  const source = body.origin_tank_source ?? 'legado'
  const totalLiters = Number(body.total_litros)

  // Load origin tank
  let origem: any = null
  if (source === 'novo_fluxo') {
    const { data } = await supabase
      .from('ordens_tanque_novo_fluxo')
      .select('id, quantidade, lote, planning_status, status, produto_sku')
      .eq('id', body.origin_tank_order_id)
      .single()
    origem = data
  } else {
    const { data } = await supabase
      .from('ordens')
      .select('id, etapa, quantidade, lote, planning_status, status, produto_sku')
      .eq('id', body.origin_tank_order_id)
      .single()
    origem = data
  }

  if (!origem) return res.status(422).json({ error: 'Ordem de tanque nao encontrada' })
  if (isCanceled(origem.planning_status, origem.status)) return res.status(422).json({ error: 'Ordem de tanque cancelada nao pode ser usada' })

  const [{ data: novosEnvases }, { data: legacyEnvases }] = await Promise.all([
    supabase
      .from('ordens_envase_novo_fluxo')
      .select('quantidade, planning_status, status')
      .eq('origin_tank_source', source)
      .eq('origin_tank_order_id', body.origin_tank_order_id),
    source === 'legado'
      ? supabase
          .from('ordens')
          .select('quantidade, planning_status, status')
          .eq('etapa', 'envase')
          .eq('origin_tank_order_id', body.origin_tank_order_id)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const fromNew = ((novosEnvases as any[] | null) ?? []).reduce((acc: number, row: any) => {
    if (isCanceled(row.planning_status, row.status)) return acc
    return acc + Number(row.quantidade || 0)
  }, 0)
  const fromLegacy = ((legacyEnvases as any[] | null) ?? []).reduce((acc: number, row: any) => {
    if (isCanceled(row.planning_status, row.status)) return acc
    return acc + Number(row.quantidade || 0)
  }, 0)

  const balance = calculateTankVolumeBalance({
    tankLiters: Number(origem.quantidade || 0),
    alreadyFilledLiters: fromNew + fromLegacy,
    currentFillingLiters: totalLiters,
    tolerance: VOLUME_BALANCE_TOLERANCE_LITERS,
  })

  if (balance.status === 'OVER') {
    return res.status(422).json({ error: 'Volume de envase excede o saldo do tanque de origem.' })
  }

  const startAt = new Date(String(body.inicio_agendado))
  if (!Number.isFinite(startAt.getTime())) return res.status(422).json({ error: 'inicio_agendado invalido' })
  if (isScheduleStartInPast(startAt)) return res.status(422).json({ error: SCHEDULE_IN_PAST_ERROR })

  const productionTimeMinutes = Math.max(1, Math.round(Number(body.production_time_minutes)))
  const cleaningTimeMinutes = Math.max(0, Math.round(Number(body.cleaning_time_minutes)))
  const totalDurationMinutes = Math.max(
    1,
    calculateTotalDuration({ setupTimeMinutes: 0, productionTimeMinutes, cleaningTimeMinutes })
  )
  const endAt = calculateProductionEndTime(startAt, totalDurationMinutes)

  const { data: produto } = await supabase
    .from('produtos')
    .select('sku, cor')
    .eq('sku', body.produto_sku)
    .single()
  if (!produto) return res.status(404).json({ error: 'Produto nao encontrado' })

  const { data: existentes } = await supabase.from('ordens_envase_novo_fluxo').select('*')
  const hasConflict = hasScheduleConflict({
    productionType: 'FILLING',
    machineId: body.maquina_id ?? null,
    newStart: startAt,
    newEnd: endAt,
    existingSchedules: ((existentes as any[] | null) ?? []).map((row: any) => ({
      ...row,
      etapa: 'envase' as const,
      sincronizado_em: row.inicio_agendado,
    } as Ordem)),
  })
  if (hasConflict) {
    return res.status(409).json({ error: 'Ja existe uma producao agendada nessa maquina para este horario.' })
  }

  const packageVolumeLiters = Number(body.package_volume_liters)
  const unitsPerBox = Math.max(1, Math.round(Number(body.units_per_box)))
  const quantityBoxes = Math.max(0, Math.round(Number(body.quantidade_embalagens ?? 0)))
  const quantityLooseUnits = Math.max(0, Math.round(Number(body.quantidade_unidades_avulsas ?? 0)))
  const totalUnits = Math.max(1, Math.round(Number(body.total_unidades)))
  const calcMode = unitsPerBox > 1 && quantityLooseUnits === 0 ? 'BOXES_MASTER' : 'LITERS_MASTER'
  const numeroExterno = `ENV2-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`
  const planningStatus = origem.planning_status === 'COMPLETED' ? 'SCHEDULED' : 'WAITING_TANK'

  const { data: nova, error } = await supabase
    .from('ordens_envase_novo_fluxo')
    .insert({
      numero_externo: numeroExterno,
      produto_sku: body.produto_sku,
      quantidade: totalLiters,
      unidade: 'L',
      tanque: body.nome_produto,
      lote: origem.lote,
      etapa: 'envase',
      maquina_id: body.maquina_id,
      package_volume_liters: packageVolumeLiters,
      units_per_box: unitsPerBox,
      box_volume_liters: packageVolumeLiters * unitsPerBox,
      estimated_boxes: unitsPerBox > 1 ? quantityBoxes : null,
      total_unidades: totalUnits,
      quantidade_agrupamentos: quantityBoxes,
      quantidade_unidades_avulsas: quantityLooseUnits,
      embalagem_label: body.embalagem_label,
      origin_tank_order_id: String(body.origin_tank_order_id),
      origin_tank_source: source,
      production_time_minutes: productionTimeMinutes,
      cleaning_time_minutes: cleaningTimeMinutes,
      total_duration_minutes: totalDurationMinutes,
      inicio_agendado: startAt.toISOString(),
      fim_calculado: endAt.toISOString(),
      planning_status: planningStatus,
      calc_mode: calcMode,
      color: (produto as any).cor ?? null,
      notes: null,
      data_prevista: body.data_prevista,
      status: 'aguardando',
    })
    .select('*')
    .single()

  if (error || !nova) return res.status(400).json({ error: error?.message ?? 'Erro ao criar ordem de envase' })
  return res.status(201).json(nova)
})

export default router
