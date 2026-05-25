import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .eq('ativo', true)
    .order('hora_inicio')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const { nome, hora_inicio, hora_fim } = body

  if (!nome || typeof nome !== 'string' || !nome.trim())
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 422 })
  if (hora_inicio === undefined || hora_inicio === null || typeof hora_inicio !== 'number' || hora_inicio < 0 || hora_inicio > 1439)
    return NextResponse.json({ error: 'Hora de início inválida' }, { status: 422 })
  if (hora_fim === undefined || hora_fim === null || typeof hora_fim !== 'number' || hora_fim < 0 || hora_fim > 1439)
    return NextResponse.json({ error: 'Hora de fim inválida' }, { status: 422 })

  const { data, error } = await supabase
    .from('turnos')
    .insert({ nome: nome.trim(), hora_inicio, hora_fim })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const { id, nome, hora_inicio, hora_fim, ativo } = body

  if (!id) return NextResponse.json({ error: 'ID é obrigatório' }, { status: 422 })

  const updates: Record<string, unknown> = {}
  if (nome !== undefined) {
    if (typeof nome !== 'string' || !nome.trim())
      return NextResponse.json({ error: 'Nome inválido' }, { status: 422 })
    updates.nome = nome.trim()
  }
  if (hora_inicio !== undefined) {
    if (typeof hora_inicio !== 'number' || hora_inicio < 0 || hora_inicio > 1439)
      return NextResponse.json({ error: 'Hora de início inválida' }, { status: 422 })
    updates.hora_inicio = hora_inicio
  }
  if (hora_fim !== undefined) {
    if (typeof hora_fim !== 'number' || hora_fim < 0 || hora_fim > 1439)
      return NextResponse.json({ error: 'Hora de fim inválida' }, { status: 422 })
    updates.hora_fim = hora_fim
  }
  if (ativo !== undefined) updates.ativo = ativo

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 422 })

  const { data, error } = await supabase
    .from('turnos')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const { id } = body

  if (!id) return NextResponse.json({ error: 'ID é obrigatório' }, { status: 422 })

  const { error } = await supabase
    .from('turnos')
    .update({ ativo: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
