import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PlanningStatus } from '@/types'

type PatchBody = {
  numero_externo?: string
  production_time_minutes?: number | null
  cleaning_time_minutes?: number | null
  data_prevista?: string | null
  planning_status?: PlanningStatus
  motivo?: string
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const body: PatchBody = await req.json()

  const { data: ordemAtual, error: fetchError } = await supabase
    .from('ordens')
    .select('id, numero_externo, planning_status, production_time_minutes, cleaning_time_minutes, total_duration_minutes, data_prevista')
    .eq('id', id)
    .single()

  if (fetchError || !ordemAtual) {
    return NextResponse.json({ error: 'Ordem não encontrada' }, { status: 404 })
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
    return NextResponse.json({ error: 'Nenhum campo alterado' }, { status: 422 })
  }

  const { data: ordemAtualizada, error: updateError } = await supabase
    .from('ordens')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError || !ordemAtualizada) {
    return NextResponse.json({ error: updateError?.message ?? 'Erro ao atualizar' }, { status: 500 })
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

  return NextResponse.json(ordemAtualizada)
}
