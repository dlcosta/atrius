import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'
import { normalizarEmbalagem, calcularVolumeTotalEnvase } from '../lib/envase/normalizar-embalagem'
import type { PlanningStatus } from '../types'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('ordens')
    .select(`
      id,
      numero_externo,
      tanque,
      tank_id,
      quantidade,
      unidade,
      data_prevista,
      planning_status,
      etapa,
      setup_time_minutes,
      production_time_minutes,
      cleaning_time_minutes,
      total_duration_minutes,
      tank_volume_liters,
      sincronizado_em,
      ordens_pedidos_erp (
        id,
        numero_pedido,
        produto_descricao,
        quantidade,
        total_litros
      )
    `)
    .eq('planning_status', 'BACKLOG')
    .eq('etapa', 'tanque')
    .order('data_prevista', { ascending: true, nullsFirst: false })

  if (error) return res.status(500).json({ error: error.message })

  const items = (data ?? []).map((row: any) => {
    const pedidos = row.ordens_pedidos_erp ?? []
    const totalLitros = pedidos.reduce((acc: number, p: any) => acc + (Number(p.total_litros) || 0), 0)
    return {
      id: row.id,
      numero_externo: row.numero_externo,
      tanque: row.tanque,
      tank_id: row.tank_id,
      quantidade: row.quantidade,
      unidade: row.unidade,
      data_prevista: row.data_prevista,
      planning_status: row.planning_status,
      etapa: row.etapa,
      setup_time_minutes: row.setup_time_minutes,
      production_time_minutes: row.production_time_minutes,
      cleaning_time_minutes: row.cleaning_time_minutes,
      total_duration_minutes: row.total_duration_minutes,
      tank_volume_liters: row.tank_volume_liters,
      sincronizado_em: row.sincronizado_em,
      pedidos,
      pedidos_count: pedidos.length,
      total_litros_pedidos: totalLitros,
    }
  })

  return res.json(items)
})

const BACKLOG_ENVASE_STATUSES: PlanningStatus[] = ['BACKLOG', 'WAITING_TANK', 'READY_TO_SCHEDULE']

router.get('/envase', async (_req: Request, res: Response) => {
  const supabase = createClient()

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

  if (error) return res.status(500).json({ error: error.message })

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

  const items = (data ?? []).map((row: any) => {
    const pedidos = row.ordens_pedidos_erp ?? []
    const totalLitrosPedidos = pedidos.reduce((acc: number, p: any) => acc + (Number(p.total_litros) || 0), 0)

    const produtoDescricao = (pedidos[0]?.produto_descricao as string | undefined) ?? row.produto_sku ?? ''
    const parsed = normalizarEmbalagem(produtoDescricao)

    const calcMode = row.calc_mode === 'BOXES_MASTER' ? 'BOXES_MASTER' : 'LITERS_MASTER'
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

  return res.json(items)
})

export default router
