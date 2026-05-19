import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Busca agendamento ativo de uma ordem pelo ordem_id
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const ordemId = searchParams.get('ordem_id')

  if (!ordemId) {
    return NextResponse.json({ error: 'ordem_id obrigatório' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('agendamentos_producao')
    .select('*')
    .eq('ordem_id', ordemId)
    .in('status', ['SCHEDULED', 'PAUSED'])
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? null)
}

type PostBody = {
  ordem_id: string
  tank_id: string
  turno_id: string
  turno_nome: string
  data_agendamento: string
  inicio_agendado?: string
  fim_calculado?: string
  production_time_minutes?: number
  cleaning_time_minutes?: number
}

function validar(body: Partial<PostBody>): string | null {
  if (!body.ordem_id?.trim()) return 'ordem_id obrigatório'
  if (!body.tank_id?.trim()) return 'tank_id obrigatório'
  if (!body.turno_id?.trim()) return 'turno_id obrigatório'
  if (!body.turno_nome?.trim()) return 'turno_nome obrigatório'
  if (!body.data_agendamento?.trim()) return 'data_agendamento obrigatório'
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body: Partial<PostBody> = await req.json()

  const erroValidacao = validar(body)
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 422 })

  const { ordem_id, tank_id, turno_id, turno_nome, data_agendamento, inicio_agendado, fim_calculado, production_time_minutes, cleaning_time_minutes } = body as PostBody

  // Verificar se ordem existe e está em BACKLOG
  const { data: ordem, error: ordemError } = await supabase
    .from('ordens')
    .select('id, planning_status')
    .eq('id', ordem_id)
    .single()

  if (ordemError || !ordem) {
    return NextResponse.json({ error: 'Ordem não encontrada' }, { status: 404 })
  }

  if (ordem.planning_status !== 'BACKLOG') {
    return NextResponse.json(
      { error: `Ordem não está em BACKLOG (status atual: ${ordem.planning_status})` },
      { status: 422 }
    )
  }

  // Verificar se tanque existe
  const { data: tanque, error: tanqueError } = await supabase
    .from('tanques')
    .select('id, volume_liters')
    .eq('id', tank_id)
    .single()

  if (tanqueError || !tanque) {
    return NextResponse.json({ error: 'Tanque não encontrado' }, { status: 404 })
  }

  // Criar agendamento
  const { data: agendamento, error: agendamentoError } = await supabase
    .from('agendamentos_producao')
    .insert({
      ordem_id,
      tank_id,
      turno_id,
      turno_nome,
      data_agendamento,
      status: 'SCHEDULED',
    })
    .select('*')
    .single()

  if (agendamentoError || !agendamento) {
    return NextResponse.json(
      { error: `Erro ao criar agendamento: ${agendamentoError?.message}` },
      { status: 500 }
    )
  }

  // Atualizar status da ordem para SCHEDULED com todos os dados de agendamento
  const ordemUpdates: Record<string, unknown> = {
    planning_status: 'SCHEDULED',
    tank_id,
  }
  if (inicio_agendado) ordemUpdates.inicio_agendado = inicio_agendado
  if (fim_calculado) ordemUpdates.fim_calculado = fim_calculado
  if (production_time_minutes != null) ordemUpdates.production_time_minutes = production_time_minutes
  if (cleaning_time_minutes != null) ordemUpdates.cleaning_time_minutes = cleaning_time_minutes
  if (production_time_minutes != null || cleaning_time_minutes != null) {
    ordemUpdates.total_duration_minutes = (production_time_minutes ?? 0) + (cleaning_time_minutes ?? 0) || null
  }

  const { error: updateError } = await supabase
    .from('ordens')
    .update(ordemUpdates)
    .eq('id', ordem_id)

  if (updateError) {
    // Se falhar ao atualizar ordem, deletar agendamento
    await supabase.from('agendamentos_producao').delete().eq('id', agendamento.id)
    return NextResponse.json(
      { error: `Erro ao atualizar status da ordem: ${updateError.message}` },
      { status: 500 }
    )
  }

  // Registrar log de agendamento
  await supabase.from('ordens_audit_log').insert({
    ordem_id,
    agendamento_id: agendamento.id,
    operacao: 'AGENDADO',
    descricao: `Agendado para ${turno_nome} em ${data_agendamento} — Tanque ${tank_id}`,
    dados_antes: { planning_status: 'BACKLOG' },
    dados_depois: { planning_status: 'SCHEDULED', tank_id, turno_id, turno_nome, data_agendamento, inicio_agendado, fim_calculado },
  })

  return NextResponse.json(agendamento, { status: 201 })
}

// DELETE: Desagendar (volta para BACKLOG)
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const agendamentoId = searchParams.get('id')

  if (!agendamentoId) {
    return NextResponse.json({ error: 'id obrigatório' }, { status: 422 })
  }

  // Buscar agendamento
  const { data: agendamento, error: agendamentoError } = await supabase
    .from('agendamentos_producao')
    .select('ordem_id, status')
    .eq('id', agendamentoId)
    .single()

  if (agendamentoError || !agendamento) {
    return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 })
  }

  // Só pode desagendar se estiver em SCHEDULED ou PAUSED
  if (!['SCHEDULED', 'PAUSED'].includes(agendamento.status)) {
    return NextResponse.json(
      { error: `Não pode desagendar ordem com status ${agendamento.status}` },
      { status: 422 }
    )
  }

  // Deletar agendamento
  const { error: deleteError } = await supabase
    .from('agendamentos_producao')
    .delete()
    .eq('id', agendamentoId)

  if (deleteError) {
    return NextResponse.json(
      { error: `Erro ao deletar agendamento: ${deleteError.message}` },
      { status: 500 }
    )
  }

  // Voltar ordem para BACKLOG
  const { error: updateError } = await supabase
    .from('ordens')
    .update({ planning_status: 'BACKLOG' })
    .eq('id', agendamento.ordem_id)

  if (updateError) {
    return NextResponse.json(
      { error: `Erro ao atualizar status da ordem: ${updateError.message}` },
      { status: 500 }
    )
  }

  // Registrar log de cancelamento
  await supabase.from('ordens_audit_log').insert({
    ordem_id: agendamento.ordem_id,
    operacao: 'CANCELADO',
    descricao: 'Agendamento removido — ordem retornou ao backlog',
    dados_antes: { planning_status: agendamento.status, agendamento_id: agendamentoId },
    dados_depois: { planning_status: 'BACKLOG' },
  })

  return NextResponse.json({ success: true })
}
