import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type OrdemBacklogItem = {
  id: string
  numero_externo: string
  tanque: string | null
  tank_id: string | null
  quantidade: number
  unidade: string
  data_prevista: string | null
  planning_status: string
  etapa: string
  production_time_minutes: number | null
  cleaning_time_minutes: number | null
  total_duration_minutes: number | null
  tank_volume_liters: number | null
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

export async function GET() {
  const supabase = await createClient()

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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items: OrdemBacklogItem[] = (data ?? []).map((row: any) => {
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

  return NextResponse.json(items)
}
