import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'
import { isScheduleStartInPast, SCHEDULE_IN_PAST_ERROR } from '../lib/planning/schedule'
import type { PlanningStatus } from '../types'

const router = Router()

router.get('/ordens/:id', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { id } = req.params

  const { data: ordem, error } = await supabase
    .from('ordens')
    .select(`
      *,
      ordens_pedidos_erp (
        id,
        numero_pedido,
        produto_descricao,
        quantidade,
        total_litros
      ),
      agendamentos_producao (
        id,
        tank_id,
        data_agendamento,
        turno_id,
        turno_nome,
        status
      )
    `)
    .eq('id', id)
    .single()

  if (error || !ordem) {
    // Fallback: check new flow tables
    const { data: novoTanque } = await supabase
      .from('ordens_tanque_novo_fluxo').select('*').eq('id', id).maybeSingle()
    if (novoTanque) return res.json({ ...novoTanque, flow_source: 'novo_fluxo_tanque', etapa: 'tanque' })

    const { data: novoEnvase } = await supabase
      .from('ordens_envase_novo_fluxo').select('*').eq('id', id).maybeSingle()
    if (novoEnvase) return res.json({ ...novoEnvase, flow_source: 'novo_fluxo_envase', etapa: 'envase' })

    return res.status(404).json({ error: 'Ordem não encontrada' })
  }

  return res.json(ordem)
})

router.patch('/ordens/:id', async (req: Request, res: Response) => {
  const supabase = createClient()
  const { id } = req.params
  const body = req.body as {
    numero_externo?: string
    production_time_minutes?: number | null
    cleaning_time_minutes?: number | null
    data_prevista?: string | null
    planning_status?: PlanningStatus
    motivo?: string
  }

  const { data: ordemAtual, error: fetchError } = await supabase
    .from('ordens')
    .select('id, numero_externo, planning_status, production_time_minutes, cleaning_time_minutes, total_duration_minutes, data_prevista')
    .eq('id', id)
    .single()

  if (fetchError || !ordemAtual) {
    return res.status(404).json({ error: 'Ordem não encontrada' })
  }

  const updates: Record<string, unknown> = {}
  const dadosAntes: Record<string, unknown> = {}
  const dadosDepois: Record<string, unknown> = {}

  if (body.numero_externo !== undefined && body.numero_externo !== ordemAtual.numero_externo) {
    dadosAntes.numero_externo = ordemAtual.numero_externo
    dadosDepois.numero_externo = body.numero_externo
    updates.numero_externo = body.numero_externo
  }

  if (body.data_prevista !== undefined) {
    dadosAntes.data_prevista = ordemAtual.data_prevista
    dadosDepois.data_prevista = body.data_prevista
    updates.data_prevista = body.data_prevista
  }

  const novoProducao = body.production_time_minutes !== undefined
    ? body.production_time_minutes
    : ordemAtual.production_time_minutes

  const novaLimpeza = body.cleaning_time_minutes !== undefined
    ? body.cleaning_time_minutes
    : ordemAtual.cleaning_time_minutes

  if (body.production_time_minutes !== undefined) {
    dadosAntes.production_time_minutes = ordemAtual.production_time_minutes
    dadosDepois.production_time_minutes = body.production_time_minutes
    updates.production_time_minutes = body.production_time_minutes
  }

  if (body.cleaning_time_minutes !== undefined) {
    dadosAntes.cleaning_time_minutes = ordemAtual.cleaning_time_minutes
    dadosDepois.cleaning_time_minutes = body.cleaning_time_minutes
    updates.cleaning_time_minutes = body.cleaning_time_minutes
  }

  if (body.production_time_minutes !== undefined || body.cleaning_time_minutes !== undefined) {
    const total =
      (novoProducao ?? 0) + (novaLimpeza ?? 0) > 0
        ? (novoProducao ?? 0) + (novaLimpeza ?? 0)
        : null
    dadosAntes.total_duration_minutes = ordemAtual.total_duration_minutes
    dadosDepois.total_duration_minutes = total
    updates.total_duration_minutes = total
  }

  if (body.planning_status !== undefined && body.planning_status !== ordemAtual.planning_status) {
    dadosAntes.planning_status = ordemAtual.planning_status
    dadosDepois.planning_status = body.planning_status
    updates.planning_status = body.planning_status
  }

  if (Object.keys(updates).length === 0) {
    return res.status(422).json({ error: 'Nenhum campo alterado' })
  }

  const { data: ordemAtualizada, error: updateError } = await supabase
    .from('ordens')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError || !ordemAtualizada) {
    return res.status(500).json({ error: updateError?.message ?? 'Erro ao atualizar' })
  }

  const operacao =
    body.planning_status === 'CANCELED' ? 'CANCELADO'
    : body.planning_status !== undefined ? 'STATUS_ALTERADO'
    : 'EDITADO'

  const descricaoPartes: string[] = []
  if (dadosAntes.numero_externo !== undefined) descricaoPartes.push(`nome: "${dadosAntes.numero_externo}" → "${dadosDepois.numero_externo}"`)
  if (dadosAntes.data_prevista !== undefined) descricaoPartes.push(`data: ${dadosAntes.data_prevista ?? '—'} → ${dadosDepois.data_prevista ?? '—'}`)
  if (dadosAntes.production_time_minutes !== undefined) descricaoPartes.push(`produção: ${dadosAntes.production_time_minutes ?? '—'}→${dadosDepois.production_time_minutes ?? '—'}min`)
  if (dadosAntes.cleaning_time_minutes !== undefined) descricaoPartes.push(`limpeza: ${dadosAntes.cleaning_time_minutes ?? '—'}→${dadosDepois.cleaning_time_minutes ?? '—'}min`)
  if (dadosAntes.planning_status !== undefined) descricaoPartes.push(`status: ${dadosAntes.planning_status} → ${dadosDepois.planning_status}`)

  const descricao = [
    operacao === 'CANCELADO' ? 'Ordem cancelada' : operacao === 'STATUS_ALTERADO' ? 'Status alterado' : 'Ordem editada',
    descricaoPartes.length > 0 ? `(${descricaoPartes.join(', ')})` : '',
    body.motivo ? `— ${body.motivo}` : '',
  ].filter(Boolean).join(' ')

  await supabase.from('ordens_audit_log').insert({
    ordem_id: id,
    operacao,
    descricao,
    dados_antes: dadosAntes,
    dados_depois: dadosDepois,
    motivo: body.motivo ?? null,
  })

  if (body.planning_status === 'COMPLETED' && (ordemAtualizada as any).etapa === 'tanque') {
    await supabase
      .from('ordens')
      .update({ planning_status: 'SCHEDULED' })
      .eq('origin_tank_order_id', id)
      .eq('etapa', 'envase')
      .eq('planning_status', 'WAITING_TANK')
  }

  return res.json(ordemAtualizada)
})

router.get('/agendamentos', async (req: Request, res: Response) => {
  const supabase = createClient()
  const ordemId = req.query.ordem_id as string | undefined

  if (!ordemId) {
    return res.status(422).json({ error: 'ordem_id obrigatório' })
  }

  const { data, error } = await supabase
    .from('agendamentos_producao')
    .select('*')
    .eq('ordem_id', ordemId)
    .in('status', ['SCHEDULED', 'PAUSED'])
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data ?? null)
})

router.post('/agendamentos', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body as {
    ordem_id?: string
    tank_id?: string
    turno_id?: string
    turno_nome?: string
    data_agendamento?: string
    inicio_agendado?: string
    fim_calculado?: string
    production_time_minutes?: number
    cleaning_time_minutes?: number
  }

  if (!body.ordem_id?.trim()) return res.status(422).json({ error: 'ordem_id obrigatório' })
  if (!body.tank_id?.trim()) return res.status(422).json({ error: 'tank_id obrigatório' })
  if (!body.turno_id?.trim()) return res.status(422).json({ error: 'turno_id obrigatório' })
  if (!body.turno_nome?.trim()) return res.status(422).json({ error: 'turno_nome obrigatório' })
  if (!body.data_agendamento?.trim()) return res.status(422).json({ error: 'data_agendamento obrigatório' })

  const { ordem_id, tank_id, turno_id, turno_nome, data_agendamento, inicio_agendado, fim_calculado, production_time_minutes, cleaning_time_minutes } = body as Required<typeof body>
  if (inicio_agendado) {
    const startAt = new Date(inicio_agendado)
    if (!Number.isFinite(startAt.getTime())) return res.status(422).json({ error: 'inicio_agendado inválido' })
    if (isScheduleStartInPast(startAt)) return res.status(422).json({ error: SCHEDULE_IN_PAST_ERROR })
  }

  const { data: ordem, error: ordemError } = await supabase
    .from('ordens')
    .select('id, planning_status')
    .eq('id', ordem_id)
    .single()

  if (ordemError || !ordem) return res.status(404).json({ error: 'Ordem não encontrada' })
  if (ordem.planning_status !== 'BACKLOG') {
    return res.status(422).json({ error: `Ordem não está em BACKLOG (status atual: ${ordem.planning_status})` })
  }

  const { data: tanque, error: tanqueError } = await supabase
    .from('tanques')
    .select('id, volume_liters')
    .eq('id', tank_id)
    .single()

  if (tanqueError || !tanque) return res.status(404).json({ error: 'Tanque não encontrado' })

  const { data: agendamento, error: agendamentoError } = await supabase
    .from('agendamentos_producao')
    .insert({ ordem_id, tank_id, turno_id, turno_nome, data_agendamento, status: 'SCHEDULED' })
    .select('*')
    .single()

  if (agendamentoError || !agendamento) {
    return res.status(500).json({ error: `Erro ao criar agendamento: ${agendamentoError?.message}` })
  }

  const ordemUpdates: Record<string, unknown> = { planning_status: 'SCHEDULED', tank_id }
  if (inicio_agendado) ordemUpdates.inicio_agendado = inicio_agendado
  if (fim_calculado) ordemUpdates.fim_calculado = fim_calculado
  if (production_time_minutes != null) ordemUpdates.production_time_minutes = production_time_minutes
  if (cleaning_time_minutes != null) ordemUpdates.cleaning_time_minutes = cleaning_time_minutes
  if (production_time_minutes != null || cleaning_time_minutes != null) {
    ordemUpdates.total_duration_minutes = (production_time_minutes ?? 0) + (cleaning_time_minutes ?? 0) || null
  }

  const { error: updateError } = await supabase.from('ordens').update(ordemUpdates).eq('id', ordem_id)
  if (updateError) {
    await supabase.from('agendamentos_producao').delete().eq('id', agendamento.id)
    return res.status(500).json({ error: `Erro ao atualizar status da ordem: ${updateError.message}` })
  }

  await supabase.from('ordens_audit_log').insert({
    ordem_id,
    agendamento_id: agendamento.id,
    operacao: 'AGENDADO',
    descricao: `Agendado para ${turno_nome} em ${data_agendamento} — Tanque ${tank_id}`,
    dados_antes: { planning_status: 'BACKLOG' },
    dados_depois: { planning_status: 'SCHEDULED', tank_id, turno_id, turno_nome, data_agendamento, inicio_agendado, fim_calculado },
  })

  return res.status(201).json(agendamento)
})

router.delete('/agendamentos', async (req: Request, res: Response) => {
  const supabase = createClient()
  const agendamentoId = req.query.id as string | undefined

  if (!agendamentoId) return res.status(422).json({ error: 'id obrigatório' })

  const { data: agendamento, error: agendamentoError } = await supabase
    .from('agendamentos_producao')
    .select('ordem_id, status')
    .eq('id', agendamentoId)
    .single()

  if (agendamentoError || !agendamento) return res.status(404).json({ error: 'Agendamento não encontrado' })

  if (!['SCHEDULED', 'PAUSED'].includes(agendamento.status)) {
    return res.status(422).json({ error: `Não pode desagendar ordem com status ${agendamento.status}` })
  }

  const { error: deleteError } = await supabase.from('agendamentos_producao').delete().eq('id', agendamentoId)
  if (deleteError) {
    return res.status(500).json({ error: `Erro ao deletar agendamento: ${deleteError.message}` })
  }

  const { error: updateError } = await supabase
    .from('ordens')
    .update({ planning_status: 'BACKLOG' })
    .eq('id', agendamento.ordem_id)

  if (updateError) {
    return res.status(500).json({ error: `Erro ao atualizar status da ordem: ${updateError.message}` })
  }

  await supabase.from('ordens_audit_log').insert({
    ordem_id: agendamento.ordem_id,
    operacao: 'CANCELADO',
    descricao: 'Agendamento removido — ordem retornou ao backlog',
    dados_antes: { planning_status: agendamento.status, agendamento_id: agendamentoId },
    dados_depois: { planning_status: 'BACKLOG' },
  })

  return res.json({ success: true })
})

export default router
