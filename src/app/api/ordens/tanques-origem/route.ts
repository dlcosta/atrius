import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateTankVolumeBalance, VOLUME_BALANCE_TOLERANCE_LITERS } from '@/lib/planning/production'

type OrdemTanqueRow = {
  id: string
  numero_externo: string
  produto_sku: string | null
  lote: string | null
  quantidade: number
  data_prevista: string | null
  planning_status: string | null
  status: string | null
}

type OrdemEnvaseRow = {
  id: string
  origin_tank_order_id: string | null
  quantidade: number
  planning_status: string | null
  status: string | null
}

function isCanceled(planningStatus: string | null, status: string | null): boolean {
  return planningStatus === 'CANCELED' || status === 'cancelada'
}

export async function GET() {
  const supabase = await createClient()

  const [{ data: tankOrders, error: tankError }, { data: fillingOrders, error: fillingError }] = await Promise.all([
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
  ])

  if (tankError) return NextResponse.json({ error: tankError.message }, { status: 500 })
  if (fillingError) return NextResponse.json({ error: fillingError.message }, { status: 500 })

  const filledByOrigin = new Map<string, number>()
  for (const row of (fillingOrders as OrdemEnvaseRow[]) ?? []) {
    if (!row.origin_tank_order_id) continue
    if (isCanceled(row.planning_status, row.status)) continue
    const current = filledByOrigin.get(row.origin_tank_order_id) ?? 0
    filledByOrigin.set(row.origin_tank_order_id, current + Number(row.quantidade || 0))
  }

  const eligible = ((tankOrders as OrdemTanqueRow[]) ?? [])
    .filter((order) => !isCanceled(order.planning_status, order.status))
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
      }
    })
    .filter((item) => item.saldo_litros > VOLUME_BALANCE_TOLERANCE_LITERS)
    .sort((a, b) => {
      if (a.data_prevista && b.data_prevista) return a.data_prevista.localeCompare(b.data_prevista)
      if (a.data_prevista) return -1
      if (b.data_prevista) return 1
      return a.numero_externo.localeCompare(b.numero_externo)
    })

  return NextResponse.json(eligible)
}
