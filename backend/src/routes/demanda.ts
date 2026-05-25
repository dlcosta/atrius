import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'
import { buscarItensDemanda } from '../lib/demanda/itens'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const supabase = createClient()
  const mostrarAlocados = req.query.mostrar_alocados === 'true'

  try {
    const itens = await buscarItensDemanda(supabase, mostrarAlocados)
    return res.json(itens)
  } catch (error) {
    return res.status(500).json({ error: String(error) })
  }
})

router.get('/ordens', async (_req: Request, res: Response) => {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('ordens')
    .select(`
      *,
      agendamentos_producao!inner (
        id,
        tank_id,
        data_agendamento,
        turno_id
      )
    `)
    .eq('etapa', 'tanque')
    .in('planning_status', ['SCHEDULED', 'IN_PRODUCTION'])

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  const ordensComAgendamento = (data as any[])?.map((ordem) => {
    const agendamento = ordem.agendamentos_producao?.[0]
    const dataAgendamento = agendamento?.data_agendamento
      ? (typeof agendamento.data_agendamento === 'string'
          ? agendamento.data_agendamento
          : new Date(agendamento.data_agendamento).toISOString().split('T')[0])
      : ordem.data_prevista

    return {
      ...ordem,
      tank_id: agendamento?.tank_id,
      turno_id: agendamento?.turno_id,
      data_prevista: dataAgendamento,
      planning_status: ordem.planning_status,
    }
  }) ?? []

  return res.json(ordensComAgendamento)
})

router.post('/ordens', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body as {
    categoria_produto?: string
    nome_ordem?: string
    data_prevista?: string
    tank_id?: string
    total_litros?: number
    itens?: Array<{ numero_pedido: string; produto_descricao: string; quantidade: number; total_litros: number }>
    production_time_minutes?: number
    cleaning_time_minutes?: number
  }

  if (!body.categoria_produto?.trim()) return res.status(422).json({ error: 'categoria_produto obrigatória' })
  if (!body.nome_ordem?.trim()) return res.status(422).json({ error: 'nome_ordem obrigatório' })
  if (!body.data_prevista?.trim()) return res.status(422).json({ error: 'data_prevista obrigatória' })
  if (!body.tank_id?.trim()) return res.status(422).json({ error: 'tank_id obrigatório' })
  if (!body.total_litros || body.total_litros <= 0) return res.status(422).json({ error: 'total_litros deve ser maior que zero' })
  if (!Array.isArray(body.itens) || body.itens.length === 0) return res.status(422).json({ error: 'itens não pode ser vazio' })
  if (body.production_time_minutes !== undefined && body.production_time_minutes !== null && body.production_time_minutes <= 0)
    return res.status(422).json({ error: 'production_time_minutes deve ser maior que zero' })

  const { categoria_produto, nome_ordem, data_prevista, tank_id, total_litros, itens, production_time_minutes, cleaning_time_minutes } = body as Required<typeof body>
  const prodMin = production_time_minutes ?? null
  const cleanMin = cleaning_time_minutes ?? null
  const totalMin = prodMin !== null && cleanMin !== null ? prodMin + cleanMin : prodMin !== null ? prodMin : null

  const { data: tanque, error: tanqueError } = await supabase
    .from('tanques')
    .select('volume_liters')
    .eq('id', tank_id)
    .maybeSingle()

  if (tanqueError || !tanque) return res.status(404).json({ error: 'Tanque não encontrado' })
  if (total_litros > tanque.volume_liters) {
    return res.status(422).json({
      error: `Volume ${total_litros}L ultrapassa a capacidade do tanque (${tanque.volume_liters}L)`,
    })
  }

  const numero_externo = `${nome_ordem}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`

  const { data: ordem, error: ordemError } = await supabase
    .from('ordens')
    .insert({
      numero_externo,
      produto_sku: null,
      quantidade: total_litros,
      unidade: 'L',
      etapa: 'tanque',
      status: 'aguardando',
      planning_status: 'BACKLOG',
      calc_mode: 'LITERS_MASTER',
      tank_id,
      tank_volume_liters: tanque.volume_liters,
      data_prevista,
      tanque: categoria_produto,
      production_time_minutes: prodMin,
      cleaning_time_minutes: cleanMin,
      total_duration_minutes: totalMin,
    })
    .select('*')
    .single()

  if (ordemError || !ordem) {
    return res.status(500).json({ error: `Erro ao criar ordem: ${ordemError?.message}` })
  }

  const vinculos = itens.map((item) => ({
    ordem_id: ordem.id,
    numero_pedido: item.numero_pedido,
    produto_descricao: item.produto_descricao,
    quantidade: item.quantidade,
    total_litros: item.total_litros,
  }))

  const { error: vinculosError } = await supabase.from('ordens_pedidos_erp').insert(vinculos)
  if (vinculosError) {
    await supabase.from('ordens').delete().eq('id', ordem.id)
    return res.status(500).json({ error: `Erro ao vincular pedidos: ${vinculosError.message}` })
  }

  await supabase.from('ordens_audit_log').insert({
    ordem_id: ordem.id,
    operacao: 'CRIADO',
    descricao: `Ordem "${nome_ordem}" criada com ${total_litros.toLocaleString('pt-BR')}L — ${categoria_produto}`,
    dados_depois: {
      planning_status: 'BACKLOG',
      tank_id,
      total_litros,
      production_time_minutes: prodMin,
      cleaning_time_minutes: cleanMin,
      total_duration_minutes: totalMin,
      itens_count: itens.length,
    },
  })

  return res.status(201).json(ordem)
})

export default router
