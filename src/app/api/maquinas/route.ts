import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Returns ALL machines (active and inactive) so the admin can see and re-activate them.
// Note: the GanttChart component should filter to only machines where ativa === true.
export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maquinas')
    .select('*')
    .order('nome')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { nome } = await req.json()

  const { data, error } = await supabase
    .from('maquinas')
    .insert({ nome })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { id, nome, ativa } = await req.json()

  const updates: Record<string, unknown> = {}
  if (nome !== undefined) updates.nome = nome
  if (ativa !== undefined) updates.ativa = ativa

  const { data, error } = await supabase
    .from('maquinas')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
