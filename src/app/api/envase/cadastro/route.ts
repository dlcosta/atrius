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

type PostBody = {
  produto_sku?: string
  origin_tank_order_id?: string
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

type OriginTankRow = {
  id: string
  etapa: 'tanque' | 'envase'
  quantidade: number
  lote: string | null
  planning_status: string | null
  status: string | null
}

type FillingRow = {
  quantidade: number
  planning_status: string | null
  status: string | null
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function isCanceled(planningStatus: string | null, status: string | null): boolean {
  return planningStatus === 'CANCELED' || status === 'cancelada'
}

function validar(body: PostBody): string | null {
  if (!body.produto_sku?.trim()) return 'produto_sku obrigatorio'
  if (!body.origin_tank_order_id?.trim()) return 'origin_tank_order_id obrigatorio'
  if (!body.maquina_id?.trim()) return 'maquina_id obrigatorio'
  if (!body.data_prevista?.trim()) return 'data_prevista obrigatoria'
  if (!DATE_REGEX.test(body.data_prevista)) return 'data_prevista invalida'
  if (!body.inicio_agendado?.trim()) return 'inicio_agendado obrigatorio'
  if (!body.nome_produto?.trim()) return 'nome_produto obrigatorio'
  if (!body.embalagem_label?.trim()) return 'embalagem_label obrigatoria'
  if (!Number.isFinite(Number(body.package_volume_liters)) || Number(body.package_volume_liters) <= 0) {
    return 'package_volume_liters deve ser maior que zero'
  }
  if (!Number.isFinite(Number(body.units_per_box)) || Number(body.units_per_box) <= 0) {
    return 'units_per_box deve ser maior que zero'
  }
  if (!Number.isFinite(Number(body.total_unidades)) || Number(body.total_unidades) <= 0) {
    return 'total_unidades deve ser maior que zero'
  }
  if (!Number.isFinite(Number(body.total_litros)) || Number(body.total_litros) <= 0) {
    return 'total_litros deve ser maior que zero'
  }
  if (!Number.isFinite(Number(body.production_time_minutes)) || Number(body.production_time_minutes) <= 0) {
    return 'production_time_minutes deve ser maior que zero'
  }
  if (!Number.isFinite(Number(body.cleaning_time_minutes)) || Number(body.cleaning_time_minutes) < 0) {
    return 'cleaning_time_minutes deve ser maior ou igual a zero'
  }
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = (await req.json()) as PostBody

  const erroValidacao = validar(body)
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 422 })

  const startAt = new Date(String(body.inicio_agendado))
  if (!Number.isFinite(startAt.getTime())) {
    return NextResponse.json({ error: 'inicio_agendado invalido' }, { status: 422 })
  }

  const productionTimeMinutes = Math.round(Number(body.production_time_minutes))
  const cleaningTimeMinutes = Math.round(Number(body.cleaning_time_minutes))
  const totalDurationMinutes = Math.max(
    1,
    calculateTotalDuration({
      setupTimeMinutes: 0,
      productionTimeMinutes,
      cleaningTimeMinutes,
    })
  )
  const endAt = calculateProductionEndTime(startAt, totalDurationMinutes)

  const { data: produto, error: produtoError } = await supabase
    .from('produtos')
    .select('sku, cor')
    .eq('sku', body.produto_sku)
    .single()

  if (produtoError || !produto) {
    return NextResponse.json({ error: 'Produto nao encontrado' }, { status: 404 })
  }

  const { data: originTank, error: originError } = await supabase
    .from('ordens')
    .select('id, etapa, quantidade, lote, planning_status, status')
    .eq('id', body.origin_tank_order_id)
    .single()

  if (originError || !originTank) {
    return NextResponse.json({ error: 'Ordem de tanque nao encontrada' }, { status: 404 })
  }

  const origem = originTank as OriginTankRow
  if (origem.etapa !== 'tanque') {
    return NextResponse.json({ error: 'Origem informada nao e uma ordem de tanque' }, { status: 422 })
  }
  if (origem.planning_status !== 'COMPLETED') {
    return NextResponse.json({ error: 'Somente ordens de tanque concluidas podem originar envase' }, { status: 422 })
  }
  if (isCanceled(origem.planning_status, origem.status)) {
    return NextResponse.json({ error: 'Ordem de tanque cancelada nao pode ser usada' }, { status: 422 })
  }

  const { data: fillingOrders, error: fillingError } = await supabase
    .from('ordens')
    .select('quantidade, planning_status, status')
    .eq('etapa', 'envase')
    .eq('origin_tank_order_id', body.origin_tank_order_id)

  if (fillingError) {
    return NextResponse.json({ error: fillingError.message }, { status: 500 })
  }

  const alreadyFilledLiters = ((fillingOrders as FillingRow[] | null) ?? []).reduce((acc, row) => {
    if (isCanceled(row.planning_status, row.status)) return acc
    return acc + Number(row.quantidade || 0)
  }, 0)

  const balance = calculateTankVolumeBalance({
    tankLiters: Number(origem.quantidade || 0),
    alreadyFilledLiters,
    currentFillingLiters: Number(body.total_litros || 0),
    tolerance: VOLUME_BALANCE_TOLERANCE_LITERS,
  })

  if (balance.status === 'OVER') {
    return NextResponse.json(
      {
        error: `Volume de envase excede o saldo do tanque. Disponivel: ${balance.deltaLiters + Number(body.total_litros || 0)}L`,
      },
      { status: 422 }
    )
  }

  const { data: scheduledOrders } = await supabase
    .from('ordens')
    .select('*')
    .eq('etapa', 'envase')
    .not('inicio_agendado', 'is', null)

  const hasConflict = hasScheduleConflict({
    productionType: 'FILLING',
    machineId: body.maquina_id ?? null,
    newStart: startAt,
    newEnd: endAt,
    existingSchedules: (scheduledOrders as Ordem[]) ?? [],
  })

  if (hasConflict) {
    return NextResponse.json({ error: 'Ja existe uma producao agendada nessa maquina para este horario.' }, { status: 409 })
  }

  const packageVolumeLiters = Number(body.package_volume_liters)
  const unitsPerBox = Math.round(Number(body.units_per_box))
  const quantityBoxes = Math.round(Number(body.quantidade_embalagens || 0))
  const quantityLooseUnits = Math.round(Number(body.quantidade_unidades_avulsas || 0))
  const totalUnits = Math.round(Number(body.total_unidades))
  const totalLiters = Number(body.total_litros)
  const calcMode = unitsPerBox > 1 && quantityLooseUnits === 0 ? 'BOXES_MASTER' : 'LITERS_MASTER'
  const boxVolumeLiters = packageVolumeLiters * unitsPerBox
  const numeroExterno = `ENV-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`

  const { data: nova, error: insertError } = await supabase
    .from('ordens')
    .insert({
      numero_externo: numeroExterno,
      produto_sku: body.produto_sku,
      quantidade: totalLiters,
      unidade: 'L',
      data_prevista: body.data_prevista,
      tanque: body.nome_produto,
      lote: origem.lote,
      etapa: 'envase',
      status: 'aguardando',
      maquina_id: body.maquina_id,
      package_volume_liters: packageVolumeLiters,
      units_per_box: unitsPerBox,
      box_volume_liters: boxVolumeLiters || null,
      estimated_boxes: unitsPerBox > 1 ? quantityBoxes : null,
      setup_time_minutes: 0,
      production_time_minutes: productionTimeMinutes,
      cleaning_time_minutes: cleaningTimeMinutes,
      total_duration_minutes: totalDurationMinutes,
      inicio_agendado: startAt.toISOString(),
      fim_calculado: endAt.toISOString(),
      planning_status: 'SCHEDULED',
      calc_mode: calcMode,
      color: produto.cor ?? null,
      origin_tank_order_id: body.origin_tank_order_id,
      quantidade_referencia_litros: totalLiters,
    })
    .select('*')
    .single()

  if (insertError || !nova) {
    return NextResponse.json({ error: insertError?.message ?? 'Erro ao criar ordem de envase' }, { status: 400 })
  }

  await supabase.from('ordens_audit_log').insert({
    ordem_id: nova.id,
    operacao: 'CRIADO',
    descricao: `Ordem de envase criada a partir do tanque ${body.origin_tank_order_id}`,
    dados_depois: {
      produto_sku: body.produto_sku,
      nome_produto: body.nome_produto,
      embalagem_label: body.embalagem_label,
      quantidade_embalagens: quantityBoxes,
      quantidade_unidades_avulsas: quantityLooseUnits,
      total_unidades: totalUnits,
      total_litros: totalLiters,
      maquina_id: body.maquina_id,
      inicio_agendado: startAt.toISOString(),
      fim_calculado: endAt.toISOString(),
    },
  })

  return NextResponse.json(nova, { status: 201 })
}
