import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateTankVolumeBalance, VOLUME_BALANCE_TOLERANCE_LITERS } from '@/lib/planning/production'

type NewTankRow = {
  id: string
  numero_externo: string
  produto_sku: string
  lote: string | null
  quantidade: number
  data_prevista: string
  planning_status: string
  status: string
}

type LegacyTankRow = {
  id: string
  numero_externo: string
  produto_sku: string | null
  lote: string | null
  quantidade: number
  data_prevista: string | null
  planning_status: string | null
  status: string | null
}

type NewEnvaseRow = {
  origin_tank_source: string
  origin_tank_order_id: string
  quantidade: number
  planning_status: string
  status: string
}

type LegacyEnvaseRow = {
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
  for (const row of (novosEnvases as NewEnvaseRow[] | null) ?? []) {
    if (row.origin_tank_source !== 'novo_fluxo') continue
    if (isCanceled(row.planning_status, row.status)) continue
    filledNew.set(row.origin_tank_order_id, (filledNew.get(row.origin_tank_order_id) ?? 0) + Number(row.quantidade || 0))
  }

  const filledLegacy = new Map<string, number>()
  for (const row of (envasesLegado as LegacyEnvaseRow[] | null) ?? []) {
    if (!row.origin_tank_order_id) continue
    if (isCanceled(row.planning_status, row.status)) continue
    filledLegacy.set(row.origin_tank_order_id, (filledLegacy.get(row.origin_tank_order_id) ?? 0) + Number(row.quantidade || 0))
  }
  for (const row of (novosEnvases as NewEnvaseRow[] | null) ?? []) {
    if (row.origin_tank_source !== 'legado') continue
    if (isCanceled(row.planning_status, row.status)) continue
    filledLegacy.set(row.origin_tank_order_id, (filledLegacy.get(row.origin_tank_order_id) ?? 0) + Number(row.quantidade || 0))
  }

  const novoFluxo = ((novosTanques as NewTankRow[] | null) ?? [])
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

  const legado = ((tanquesLegado as LegacyTankRow[] | null) ?? [])
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

  return NextResponse.json(
    [...novoFluxo, ...legado].sort((a, b) => {
      const aData = a.data_prevista ?? ''
      const bData = b.data_prevista ?? ''
      return aData.localeCompare(bData) || a.numero_externo.localeCompare(b.numero_externo)
    })
  )
}
