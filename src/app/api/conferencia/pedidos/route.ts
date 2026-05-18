import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buscarItensDemanda } from '@/lib/demanda/itens'

export async function GET() {
  const supabase = await createClient()

  // All items — including allocated (alocado=true)
  const itens = await buscarItensDemanda(supabase, true)

  const ordemIds = [...new Set(itens.filter((i) => i.ordem_id).map((i) => i.ordem_id!))]

  if (ordemIds.length === 0) {
    return NextResponse.json(itens)
  }

  // Fetch orders with their first agendamento
  const { data: ordens } = await supabase
    .from('ordens')
    .select(`
      id,
      numero_externo,
      planning_status,
      agendamentos_producao (
        data_agendamento,
        turno_nome,
        tank_id
      )
    `)
    .in('id', ordemIds)

  // Collect tank IDs for name resolution
  const tankIds = [
    ...new Set(
      (ordens ?? []).flatMap((o: any) =>
        (o.agendamentos_producao ?? []).map((ag: any) => ag.tank_id).filter(Boolean)
      )
    ),
  ] as string[]

  const tanqueMap: Record<string, string> = {}
  if (tankIds.length > 0) {
    const { data: tanques } = await supabase.from('tanques').select('id, nome').in('id', tankIds)
    for (const t of tanques ?? []) {
      tanqueMap[(t as any).id] = (t as any).nome
    }
  }

  // Build order details map: ordem_id → enriched info
  const ordemMap: Record<string, {
    nome_ordem: string | null
    data_agendamento: string | null
    turno_nome: string | null
    tank_nome: string | null
  }> = {}

  for (const o of (ordens ?? []) as any[]) {
    const ag = o.agendamentos_producao?.[0]
    ordemMap[o.id] = {
      nome_ordem: o.numero_externo ?? null,
      data_agendamento: ag?.data_agendamento ?? null,
      turno_nome: ag?.turno_nome ?? null,
      tank_nome: ag?.tank_id ? (tanqueMap[ag.tank_id] ?? ag.tank_id) : null,
    }
  }

  const enriched = itens.map((item) => ({
    ...item,
    ...(item.ordem_id ? (ordemMap[item.ordem_id] ?? {}) : {}),
  }))

  return NextResponse.json(enriched)
}
