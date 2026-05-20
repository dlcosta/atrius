import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  calculateProductionEndTime,
  calculateTankVolumeBalance,
  calculateTotalDuration,
  hasScheduleConflict,
  VOLUME_BALANCE_TOLERANCE_LITERS,
} from '@/lib/planning/production'
import type { Ordem } from '@/types'

type EnvaseRow = {
  id: string
  numero_externo: string
  produto_sku: string
  quantidade: number
  unidade: string
  tanque: string
  lote: string | null
  etapa: 'envase'
  maquina_id: string
  package_volume_liters: number
  units_per_box: number
  box_volume_liters: number | null
  estimated_boxes: number | null
  total_unidades: number
  quantidade_agrupamentos: number
  quantidade_unidades_avulsas: number
  embalagem_label: string
  origin_tank_order_id: string
  origin_tank_source: string
  production_time_minutes: number
  cleaning_time_minutes: number
  total_duration_minutes: number
  inicio_agendado: string
  fim_calculado: string
  planning_status: string
  calc_mode: string
  color: string | null
  notes: string | null
  data_prevista: string
  status: string
}

type LegacyOrigin = {
  id: string
  etapa: 'tanque' | 'envase'
  quantidade: number
  lote: string | null
  planning_status: string | null
  status: string | null
  produto_sku: string | null
}

type NewOrigin = {
  id: string
  quantidade: number
  lote: string | null
  planning_status: string
  status: string
  produto_sku: string
}

type SaldoOrigemResult =
  | { erro: string }
  | {
      origem: NewOrigin | LegacyOrigin
      balance: ReturnType<typeof calculateTankVolumeBalance>
    }

type PostBody = {
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

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function isCanceled(planningStatus: string | null, status: string | null): boolean {
  return planningStatus === 'CANCELED' || status === 'cancelada'
}

function toOrderLike(row: EnvaseRow): Ordem {
  return {
    id: row.id,
    numero_externo: row.numero_externo,
    produto_sku: row.produto_sku,
    maquina_id: row.maquina_id,
    quantidade: Number(row.quantidade || 0),
    unidade: row.unidade,
    tanque: row.tanque,
    lote: row.lote,
    etapa: 'envase',
    package_volume_liters: row.package_volume_liters,
    units_per_box: row.units_per_box,
    box_volume_liters: row.box_volume_liters,
    estimated_boxes: row.estimated_boxes,
    production_time_minutes: row.production_time_minutes,
    cleaning_time_minutes: row.cleaning_time_minutes,
    total_duration_minutes: row.total_duration_minutes,
    planning_status: row.planning_status as Ordem['planning_status'],
    calc_mode: row.calc_mode as Ordem['calc_mode'],
    color: row.color,
    origin_tank_order_id: row.origin_tank_order_id,
    data_prevista: row.data_prevista,
    inicio_agendado: row.inicio_agendado,
    fim_calculado: row.fim_calculado,
    status: row.status as Ordem['status'],
    sincronizado_em: row.inicio_agendado,
  }
}

function validar(body: PostBody): string | null {
  if (!body.produto_sku?.trim()) return 'produto_sku obrigatorio'
  if (!body.origin_tank_order_id?.trim()) return 'origin_tank_order_id obrigatorio'
  if (!body.maquina_id?.trim()) return 'maquina_id obrigatorio'
  if (!body.data_prevista?.trim() || !DATE_REGEX.test(body.data_prevista)) return 'data_prevista invalida'
  if (!body.inicio_agendado?.trim()) return 'inicio_agendado obrigatorio'
  if (!body.nome_produto?.trim()) return 'nome_produto obrigatorio'
  if (!body.embalagem_label?.trim()) return 'embalagem_label obrigatoria'
  if (!Number.isFinite(Number(body.package_volume_liters)) || Number(body.package_volume_liters) <= 0) return 'package_volume_liters deve ser maior que zero'
  if (!Number.isFinite(Number(body.units_per_box)) || Number(body.units_per_box) <= 0) return 'units_per_box deve ser maior que zero'
  if (!Number.isFinite(Number(body.total_unidades)) || Number(body.total_unidades) <= 0) return 'total_unidades deve ser maior que zero'
  if (!Number.isFinite(Number(body.total_litros)) || Number(body.total_litros) <= 0) return 'total_litros deve ser maior que zero'
  if (!Number.isFinite(Number(body.production_time_minutes)) || Number(body.production_time_minutes) <= 0) return 'production_time_minutes deve ser maior que zero'
  if (!Number.isFinite(Number(body.cleaning_time_minutes)) || Number(body.cleaning_time_minutes) < 0) return 'cleaning_time_minutes deve ser maior ou igual a zero'
  return null
}

async function carregarOrigem(supabase: Awaited<ReturnType<typeof createClient>>, source: 'novo_fluxo' | 'legado', id: string) {
  if (source === 'novo_fluxo') {
    const { data } = await supabase
      .from('ordens_tanque_novo_fluxo')
      .select('id, quantidade, lote, planning_status, status, produto_sku')
      .eq('id', id)
      .single()
    return data as NewOrigin | null
  }

  const { data } = await supabase
    .from('ordens')
    .select('id, etapa, quantidade, lote, planning_status, status, produto_sku')
    .eq('id', id)
    .single()
  return data as LegacyOrigin | null
}

async function calcularSaldoOrigem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  source: 'novo_fluxo' | 'legado',
  id: string,
  currentLiters: number
): Promise<SaldoOrigemResult> {
  const origem = await carregarOrigem(supabase, source, id)
  if (!origem) return { erro: 'Ordem de tanque nao encontrada' }

  const etapa = 'etapa' in origem ? origem.etapa : 'tanque'
  if (etapa !== 'tanque') return { erro: 'Origem informada nao e uma ordem de tanque' }
  if (isCanceled(origem.planning_status, origem.status)) return { erro: 'Ordem de tanque cancelada nao pode ser usada' }

  const [{ data: novosEnvases }, { data: legacyEnvases }] = await Promise.all([
    supabase
      .from('ordens_envase_novo_fluxo')
      .select('quantidade, planning_status, status')
      .eq('origin_tank_source', source)
      .eq('origin_tank_order_id', id),
    source === 'legado'
      ? supabase
          .from('ordens')
          .select('quantidade, planning_status, status')
          .eq('etapa', 'envase')
          .eq('origin_tank_order_id', id)
      : Promise.resolve({ data: [] as Array<{ quantidade: number; planning_status: string | null; status: string | null }> }),
  ])

  const fromNew = ((novosEnvases as Array<{ quantidade: number; planning_status: string; status: string }> | null) ?? []).reduce((acc, row) => {
    if (isCanceled(row.planning_status, row.status)) return acc
    return acc + Number(row.quantidade || 0)
  }, 0)
  const fromLegacy = ((legacyEnvases as Array<{ quantidade: number; planning_status: string | null; status: string | null }> | null) ?? []).reduce((acc, row) => {
    if (isCanceled(row.planning_status, row.status)) return acc
    return acc + Number(row.quantidade || 0)
  }, 0)

  const balance = calculateTankVolumeBalance({
    tankLiters: Number(origem.quantidade || 0),
    alreadyFilledLiters: fromNew + fromLegacy,
    currentFillingLiters: currentLiters,
    tolerance: VOLUME_BALANCE_TOLERANCE_LITERS,
  })

  return {
    origem,
    balance,
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const inicio = searchParams.get('inicio')
  const fim = searchParams.get('fim')

  let query = supabase
    .from('ordens_envase_novo_fluxo')
    .select('*')
    .order('inicio_agendado', { ascending: true })

  if (inicio && !DATE_REGEX.test(inicio)) return NextResponse.json({ error: 'inicio invalido' }, { status: 400 })
  if (fim && !DATE_REGEX.test(fim)) return NextResponse.json({ error: 'fim invalido' }, { status: 400 })

  if (inicio && fim) {
    query = query.gte('data_prevista', inicio).lte('data_prevista', fim)
  } else if (inicio) {
    query = query.eq('data_prevista', inicio)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = (await req.json()) as PostBody

  const erroValidacao = validar(body)
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 422 })

  const source = body.origin_tank_source ?? 'legado'
  const totalLiters = Number(body.total_litros)
  const saldo = await calcularSaldoOrigem(supabase, source, String(body.origin_tank_order_id), totalLiters)
  if ('erro' in saldo) return NextResponse.json({ error: saldo.erro }, { status: 422 })
  if (saldo.balance.status === 'OVER') {
    return NextResponse.json({ error: 'Volume de envase excede o saldo do tanque de origem.' }, { status: 422 })
  }

  const startAt = new Date(String(body.inicio_agendado))
  if (!Number.isFinite(startAt.getTime())) return NextResponse.json({ error: 'inicio_agendado invalido' }, { status: 422 })

  const productionTimeMinutes = Math.max(1, Math.round(Number(body.production_time_minutes)))
  const cleaningTimeMinutes = Math.max(0, Math.round(Number(body.cleaning_time_minutes)))
  const totalDurationMinutes = Math.max(
    1,
    calculateTotalDuration({
      setupTimeMinutes: 0,
      productionTimeMinutes,
      cleaningTimeMinutes,
    })
  )
  const endAt = calculateProductionEndTime(startAt, totalDurationMinutes)

  const { data: produto } = await supabase
    .from('produtos')
    .select('sku, cor')
    .eq('sku', body.produto_sku)
    .single()
  if (!produto) return NextResponse.json({ error: 'Produto nao encontrado' }, { status: 404 })

  const { data: existentes } = await supabase.from('ordens_envase_novo_fluxo').select('*')
  const hasConflict = hasScheduleConflict({
    productionType: 'FILLING',
    machineId: body.maquina_id ?? null,
    newStart: startAt,
    newEnd: endAt,
    existingSchedules: ((existentes as EnvaseRow[] | null) ?? []).map(toOrderLike),
  })
  if (hasConflict) {
    return NextResponse.json({ error: 'Ja existe uma producao agendada nessa maquina para este horario.' }, { status: 409 })
  }

  const packageVolumeLiters = Number(body.package_volume_liters)
  const unitsPerBox = Math.max(1, Math.round(Number(body.units_per_box)))
  const quantityBoxes = Math.max(0, Math.round(Number(body.quantidade_embalagens ?? 0)))
  const quantityLooseUnits = Math.max(0, Math.round(Number(body.quantidade_unidades_avulsas ?? 0)))
  const totalUnits = Math.max(1, Math.round(Number(body.total_unidades)))
  const calcMode = unitsPerBox > 1 && quantityLooseUnits === 0 ? 'BOXES_MASTER' : 'LITERS_MASTER'
  const numeroExterno = `ENV2-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`
  const planningStatus = saldo.origem.planning_status === 'COMPLETED' ? 'SCHEDULED' : 'WAITING_TANK'

  const { data: nova, error } = await supabase
    .from('ordens_envase_novo_fluxo')
    .insert({
      numero_externo: numeroExterno,
      produto_sku: body.produto_sku,
      quantidade: totalLiters,
      unidade: 'L',
      tanque: body.nome_produto,
      lote: saldo.origem.lote,
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
      color: produto.cor ?? null,
      notes: null,
      data_prevista: body.data_prevista,
      status: 'aguardando',
    })
    .select('*')
    .single()

  if (error || !nova) return NextResponse.json({ error: error?.message ?? 'Erro ao criar ordem de envase' }, { status: 400 })
  return NextResponse.json(nova, { status: 201 })
}
