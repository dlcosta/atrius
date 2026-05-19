import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizarEmbalagem, calcularVolumeTotalEnvase } from '@/lib/envase/normalizar-embalagem'
import type { PlanningStatus } from '@/types'

export type OrdemBacklogEnvaseItem = {
  id: string
  numero_externo: string
  produto_sku: string | null
  produto_descricao: string
  produto_base: string
  embalagem_label: string
  embalagem_volume_ml: number
  litros_por_unidade: number
  unidades_por_cx: number
  confianca_embalagem: 'alta' | 'media' | 'manual'
  quantidade: number
  unidade: string
  total_litros: number
  total_embalagens: number
  data_prevista: string | null
  planning_status: PlanningStatus
  maquina_id: string | null
  origin_tank_order_id: string | null
  origin_tank_status: PlanningStatus | null
  origin_tank_nome: string | null
  setup_time_minutes: number | null
  production_time_minutes: number | null
  cleaning_time_minutes: number | null
  total_duration_minutes: number | null
  calc_mode: string | null
  sincronizado_em: string
  pedidos: {
    id: string
    numero_pedido: string
    produto_descricao: string
    quantidade: number
    total_litros: number
  }[]
  pedidos_count: number
  total_litros_pedidos: number
}

const BACKLOG_ENVASE_STATUSES: PlanningStatus[] = ['BACKLOG', 'WAITING_TANK', 'READY_TO_SCHEDULE']

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ordens')
    .select(`
      id,
      numero_externo,
      produto_sku,
      quantidade,
      unidade,
      data_prevista,
      planning_status,
      maquina_id,
      origin_tank_order_id,
      setup_time_minutes,
      production_time_minutes,
      cleaning_time_minutes,
      total_duration_minutes,
      calc_mode,
      package_volume_liters,
      units_per_box,
      sincronizado_em,
      ordens_pedidos_erp (
        id,
        numero_pedido,
        produto_descricao,
        quantidade,
        total_litros
      )
    `)
    .in('planning_status', BACKLOG_ENVASE_STATUSES)
    .eq('etapa', 'envase')
    .order('data_prevista', { ascending: true, nullsFirst: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Buscar status dos tanques de origem em batch
  const tankOrderIds = Array.from(
    new Set((data ?? []).map((r: any) => r.origin_tank_order_id).filter(Boolean))
  )

  const tankStatusMap = new Map<string, { planning_status: PlanningStatus | null; tanque: string | null }>()

  if (tankOrderIds.length > 0) {
    const { data: tanqueOrdens } = await supabase
      .from('ordens')
      .select('id, planning_status, tanque')
      .in('id', tankOrderIds)

    ;(tanqueOrdens ?? []).forEach((t: any) => {
      tankStatusMap.set(t.id, { planning_status: t.planning_status, tanque: t.tanque })
    })
  }

  const items: OrdemBacklogEnvaseItem[] = (data ?? []).map((row: any) => {
    const pedidos = row.ordens_pedidos_erp ?? []
    const totalLitrosPedidos = pedidos.reduce((acc: number, p: any) => acc + (Number(p.total_litros) || 0), 0)

    // Usar a descrição do primeiro pedido vinculado como fonte do nome do produto
    const produtoDescricao = (pedidos[0]?.produto_descricao as string | undefined) ?? row.produto_sku ?? ''
    const parsed = normalizarEmbalagem(produtoDescricao)

    const calcMode = row.calc_mode === 'BOXES_MASTER' ? 'BOXES_MASTER' : 'LITERS_MASTER'

    // Preferir dados já calculados no banco se existirem
    const litrosPorUnidade = parsed.litros_por_unidade || (Number(row.package_volume_liters) || 0)
    const unidadesPorCx = parsed.unidades_por_cx || (Number(row.units_per_box) || 1)

    const { total_litros, total_embalagens } = calcularVolumeTotalEnvase({
      quantidade: Number(row.quantidade),
      litros_por_unidade: litrosPorUnidade,
      unidades_por_cx: unidadesPorCx,
      calc_mode: calcMode,
    })

    const tankInfo = row.origin_tank_order_id ? tankStatusMap.get(row.origin_tank_order_id) : undefined

    return {
      id: row.id,
      numero_externo: row.numero_externo,
      produto_sku: row.produto_sku,
      produto_descricao: produtoDescricao,
      produto_base: parsed.produto_base || produtoDescricao,
      embalagem_label: parsed.embalagem_label || '',
      embalagem_volume_ml: parsed.embalagem_volume_ml,
      litros_por_unidade: litrosPorUnidade,
      unidades_por_cx: unidadesPorCx,
      confianca_embalagem: parsed.confianca,
      quantidade: Number(row.quantidade),
      unidade: row.unidade,
      total_litros: total_litros || totalLitrosPedidos,
      total_embalagens,
      data_prevista: row.data_prevista,
      planning_status: row.planning_status as PlanningStatus,
      maquina_id: row.maquina_id,
      origin_tank_order_id: row.origin_tank_order_id,
      origin_tank_status: tankInfo?.planning_status ?? null,
      origin_tank_nome: tankInfo?.tanque ?? null,
      setup_time_minutes: row.setup_time_minutes,
      production_time_minutes: row.production_time_minutes,
      cleaning_time_minutes: row.cleaning_time_minutes,
      total_duration_minutes: row.total_duration_minutes,
      calc_mode: row.calc_mode,
      sincronizado_em: row.sincronizado_em,
      pedidos,
      pedidos_count: pedidos.length,
      total_litros_pedidos: totalLitrosPedidos,
    }
  })

  return NextResponse.json(items)
}
