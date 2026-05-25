import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'
import { buscarItensDemanda } from '../lib/demanda/itens'

const router = Router()

router.get('/pedidos', async (_req: Request, res: Response) => {
  const supabase = createClient()

  const itens = await buscarItensDemanda(supabase, true)

  const ordemIds = [...new Set(itens.filter((i) => i.ordem_id).map((i) => i.ordem_id!))]

  if (ordemIds.length === 0) {
    return res.json(itens)
  }

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

  return res.json(enriched)
})

export default router
