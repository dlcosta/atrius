import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const ativosOnly = ['1', 'true', 'yes'].includes(
    new URL(req.url).searchParams.get('ativos')?.toLowerCase() ?? ''
  )

  let query = supabase
    .from('tanques')
    .select('*')
    .order('nome')

  if (ativosOnly) {
    query = query.eq('ativo', true)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const { nome, volume_liters } = body

  if (!nome || typeof nome !== 'string' || !nome.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 422 })
  }
  if (!volume_liters || typeof volume_liters !== 'number' || volume_liters <= 0) {
    return NextResponse.json({ error: 'Capacidade deve ser maior que zero' }, { status: 422 })
  }

  const id = crypto.randomUUID()
  const { data, error } = await supabase
    .from('tanques')
    .insert({ id, nome: nome.trim(), volume_liters })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const { id, nome, volume_liters, ativo } = body

  if (!id) return NextResponse.json({ error: 'ID é obrigatório' }, { status: 422 })

  const updates: Record<string, unknown> = {}
  if (nome !== undefined) {
    if (typeof nome !== 'string' || !nome.trim()) {
      return NextResponse.json({ error: 'Nome inválido' }, { status: 422 })
    }
    updates.nome = nome.trim()
  }
  if (volume_liters !== undefined) {
    if (typeof volume_liters !== 'number' || volume_liters <= 0) {
      return NextResponse.json({ error: 'Capacidade deve ser maior que zero' }, { status: 422 })
    }
    updates.volume_liters = volume_liters
  }
  if (ativo !== undefined) updates.ativo = ativo

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('tanques')
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
    .from('tanques')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
