import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('produtos')
    .select('*')
    .order('nome')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const { data, error } = await supabase
    .from('produtos')
    .insert({
      sku: body.sku,
      nome: body.nome,
      tempo_producao_min: Number(body.tempo_producao_min),
      tempo_limpeza_min: Number(body.tempo_limpeza_min ?? 0),
      cor: body.cor ?? '#5B9BD5',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { id, nome, tempo_producao_min, tempo_limpeza_min, cor } = await req.json()

  const updates: Record<string, unknown> = {}
  if (nome !== undefined) updates.nome = nome
  if (tempo_producao_min !== undefined) updates.tempo_producao_min = Number(tempo_producao_min)
  if (tempo_limpeza_min !== undefined) updates.tempo_limpeza_min = Number(tempo_limpeza_min)
  if (cor !== undefined) updates.cor = cor

  const { data, error } = await supabase
    .from('produtos')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { id } = await req.json()

  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
