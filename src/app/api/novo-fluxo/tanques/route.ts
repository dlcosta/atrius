import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  calculateProductionEndTime,
  calculateTotalDuration,
  hasScheduleConflict,
  validateTankCapacity,
} from '@/lib/planning/production'
import type { Ordem } from '@/types'

type TankOrderRow = {
  id: string
  numero_externo: string
  produto_sku: string
  quantidade: number
  unidade: string
  tanque: string
  lote: string | null
  etapa: 'tanque'
  tank_id: string
  tank_volume_liters: number | null
  setup_time_minutes: number
  production_time_minutes: number
  cleaning_time_minutes: number
  total_duration_minutes: number
  inicio_agendado: string
  fim_calculado: string
  planning_status: string
  color: string | null
  notes: string | null
  data_prevista: string
  status: string
}

type PostBody = {
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

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function toOrderLike(row: TankOrderRow): Ordem {
  return {
    id: row.id,
    numero_externo: row.numero_externo,
    produto_sku: row.produto_sku,
    maquina_id: null,
    quantidade: Number(row.quantidade || 0),
    unidade: row.unidade,
    tanque: row.tanque,
    lote: row.lote,
    etapa: 'tanque',
    tank_id: row.tank_id,
    tank_volume_liters: row.tank_volume_liters,
    setup_time_minutes: row.setup_time_minutes,
    production_time_minutes: row.production_time_minutes,
    cleaning_time_minutes: row.cleaning_time_minutes,
    total_duration_minutes: row.total_duration_minutes,
    planning_status: row.planning_status as Ordem['planning_status'],
    color: row.color,
    data_prevista: row.data_prevista,
    inicio_agendado: row.inicio_agendado,
    fim_calculado: row.fim_calculado,
    status: row.status as Ordem['status'],
    sincronizado_em: row.inicio_agendado,
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const inicio = searchParams.get('inicio')
  const fim = searchParams.get('fim')

  let query = supabase
    .from('ordens_tanque_novo_fluxo')
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

  if (!body.numero_externo?.trim()) return NextResponse.json({ error: 'numero_externo obrigatorio' }, { status: 422 })
  if (!body.produto_sku?.trim()) return NextResponse.json({ error: 'produto_sku obrigatorio' }, { status: 422 })
  if (!body.tank_id?.trim()) return NextResponse.json({ error: 'tank_id obrigatorio' }, { status: 422 })
  if (!body.inicio_agendado?.trim()) return NextResponse.json({ error: 'inicio_agendado obrigatorio' }, { status: 422 })
  if (!body.data_prevista?.trim() || !DATE_REGEX.test(body.data_prevista)) {
    return NextResponse.json({ error: 'data_prevista invalida' }, { status: 422 })
  }

  const liters = Number(body.liters ?? 0)
  const setupTimeMinutes = Math.max(0, Math.round(Number(body.setup_time_minutes ?? 0)))
  const productionTimeMinutes = Math.max(1, Math.round(Number(body.production_time_minutes ?? 0)))
  const cleaningTimeMinutes = Math.max(0, Math.round(Number(body.cleaning_time_minutes ?? 0)))
  if (!Number.isFinite(liters) || liters <= 0) return NextResponse.json({ error: 'liters deve ser maior que zero' }, { status: 422 })

  const startAt = new Date(body.inicio_agendado)
  if (!Number.isFinite(startAt.getTime())) return NextResponse.json({ error: 'inicio_agendado invalido' }, { status: 422 })

  const { data: produto } = await supabase
    .from('produtos')
    .select('sku, nome, cor')
    .eq('sku', body.produto_sku)
    .single()
  if (!produto) return NextResponse.json({ error: 'Produto nao encontrado' }, { status: 404 })

  const { data: tanque } = await supabase
    .from('tanques')
    .select('id, nome, volume_liters')
    .eq('id', body.tank_id)
    .single()
  if (!tanque) return NextResponse.json({ error: 'Tanque nao encontrado' }, { status: 404 })

  if (!validateTankCapacity(liters, Number(tanque.volume_liters || 0))) {
    return NextResponse.json({ error: 'Volume planejado ultrapassa a capacidade do tanque selecionado' }, { status: 422 })
  }

  const numeroExterno = body.numero_externo.trim()
  const { data: ordemExistente } = await supabase
    .from('ordens_tanque_novo_fluxo')
    .select('id')
    .eq('numero_externo', numeroExterno)
    .maybeSingle()
  if (ordemExistente) {
    return NextResponse.json({ error: 'Ja existe uma ordem de tanque com esse ID.' }, { status: 409 })
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
    existingSchedules: ((existentes as TankOrderRow[] | null) ?? []).map(toOrderLike),
  })
  if (hasConflict) {
    return NextResponse.json({ error: 'Ja existe uma producao agendada nesse tanque para este horario.' }, { status: 409 })
  }

  const { data: nova, error } = await supabase
    .from('ordens_tanque_novo_fluxo')
    .insert({
      numero_externo: numeroExterno,
      produto_sku: body.produto_sku,
      quantidade: liters,
      unidade: 'L',
      tanque: tanque.nome,
      lote: body.lote?.trim() || null,
      etapa: 'tanque',
      tank_id: tanque.id,
      tank_volume_liters: tanque.volume_liters,
      setup_time_minutes: setupTimeMinutes,
      production_time_minutes: productionTimeMinutes,
      cleaning_time_minutes: cleaningTimeMinutes,
      total_duration_minutes: totalDurationMinutes,
      inicio_agendado: startAt.toISOString(),
      fim_calculado: endAt.toISOString(),
      planning_status: body.planning_status?.trim() || 'SCHEDULED',
      color: body.color?.trim() || produto.cor || null,
      notes: body.notes?.trim() || null,
      data_prevista: body.data_prevista,
      status: 'aguardando',
    })
    .select('*')
    .single()

  if (error || !nova) return NextResponse.json({ error: error?.message ?? 'Erro ao criar ordem de tanque' }, { status: 400 })
  return NextResponse.json(nova, { status: 201 })
}
