import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'
import type { AuditOperacao } from '../types'

const router = Router()

router.get('/audit-log', async (req: Request, res: Response) => {
  const supabase = createClient()
  const ordemId = req.query.ordem_id as string | undefined

  if (!ordemId) {
    return res.status(422).json({ error: 'ordem_id obrigatório' })
  }

  const { data, error } = await supabase
    .from('ordens_audit_log')
    .select('*')
    .eq('ordem_id', ordemId)
    .order('criado_em', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data ?? [])
})

router.post('/audit-log', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body as {
    ordem_id: string
    agendamento_id?: string | null
    operacao: AuditOperacao
    descricao: string
    dados_antes?: Record<string, unknown> | null
    dados_depois?: Record<string, unknown> | null
    responsavel?: string | null
    motivo?: string | null
  }

  if (!body.ordem_id || !body.operacao || !body.descricao) {
    return res.status(422).json({ error: 'ordem_id, operacao e descricao são obrigatórios' })
  }

  const { data, error } = await supabase
    .from('ordens_audit_log')
    .insert({
      ordem_id: body.ordem_id,
      agendamento_id: body.agendamento_id ?? null,
      operacao: body.operacao,
      descricao: body.descricao,
      dados_antes: body.dados_antes ?? null,
      dados_depois: body.dados_depois ?? null,
      responsavel: body.responsavel ?? null,
      motivo: body.motivo ?? null,
    })
    .select('*')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
})

router.get('/producoes', async (req: Request, res: Response) => {
  const supabase = createClient()

  const statusParam = req.query.status as string | undefined
  const search = (req.query.search as string | undefined)?.toLowerCase()
  const dataInicio = req.query.data_inicio as string | undefined
  const dataFim = req.query.data_fim as string | undefined
  const etapaParam = (req.query.etapa as string | undefined) ?? 'tanque'

  let query = supabase
    .from('ordens')
    .select(`
      *,
      agendamentos_producao (
        id,
        tank_id,
        turno_id,
        turno_nome,
        data_agendamento,
        status,
        data_inicio,
        data_pausa,
        observacao_pausa,
        data_retomada,
        data_conclusao,
        observacao_final,
        criado_em,
        atualizado_em
      ),
      ordens_pedidos_erp (
        id,
        numero_pedido,
        produto_descricao,
        quantidade,
        total_litros,
        criado_em
      )
    `)
    .eq('etapa', etapaParam)
    .order('sincronizado_em', { ascending: false })

  if (statusParam) {
    const statuses = statusParam.split(',').map((s) => s.trim())
    query = query.in('planning_status', statuses)
  }

  if (dataInicio) query = query.gte('data_prevista', dataInicio)
  if (dataFim) query = query.lte('data_prevista', dataFim)

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  const ordens = data ?? []
  const ordemIds = ordens.map((o: any) => o.id)

  const { data: auditCounts } = await supabase
    .from('ordens_audit_log')
    .select('ordem_id')
    .in('ordem_id', ordemIds.length > 0 ? ordemIds : ['00000000-0000-0000-0000-000000000000'])

  const countMap: Record<string, number> = {}
  for (const row of auditCounts ?? []) {
    countMap[row.ordem_id] = (countMap[row.ordem_id] ?? 0) + 1
  }

  const { data: tanques } = await supabase.from('tanques').select('id, nome')
  const tanqueMap: Record<string, string> = {}
  for (const t of tanques ?? []) {
    tanqueMap[t.id] = t.nome
  }

  let resultado = ordens.map((o: any) => {
    const agendamentos = (o.agendamentos_producao ?? []).map((ag: any) => ({
      ...ag,
      tank_nome: tanqueMap[ag.tank_id] ?? ag.tank_id,
    }))
    return {
      ...o,
      agendamentos,
      pedidos_vinculados: o.ordens_pedidos_erp ?? [],
      audit_count: countMap[o.id] ?? 0,
      agendamentos_producao: undefined,
      ordens_pedidos_erp: undefined,
    }
  })

  if (search) {
    resultado = resultado.filter((o: any) => {
      const nomeLower = (o.numero_externo ?? '').toLowerCase()
      const categLower = (o.tanque ?? '').toLowerCase()
      const pedidosMatch = (o.pedidos_vinculados ?? []).some(
        (p: any) =>
          (p.numero_pedido ?? '').toLowerCase().includes(search) ||
          (p.produto_descricao ?? '').toLowerCase().includes(search)
      )
      return nomeLower.includes(search) || categLower.includes(search) || pedidosMatch
    })
  }

  return res.json(resultado)
})

export default router
