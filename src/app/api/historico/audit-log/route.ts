import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { AuditOperacao } from '@/types'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const ordemId = searchParams.get('ordem_id')

  if (!ordemId) {
    return NextResponse.json({ error: 'ordem_id obrigatório' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('ordens_audit_log')
    .select('*')
    .eq('ordem_id', ordemId)
    .order('criado_em', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  type Body = {
    ordem_id: string
    agendamento_id?: string | null
    operacao: AuditOperacao
    descricao: string
    dados_antes?: Record<string, unknown> | null
    dados_depois?: Record<string, unknown> | null
    responsavel?: string | null
    motivo?: string | null
  }

  const body: Body = await req.json()

  if (!body.ordem_id || !body.operacao || !body.descricao) {
    return NextResponse.json({ error: 'ordem_id, operacao e descricao são obrigatórios' }, { status: 422 })
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
