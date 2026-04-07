import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function mensagemErroProduto(errorMessage: string): string {
  const lower = errorMessage.toLowerCase()

  if (lower.includes('tempos_maquinas') || lower.includes('volume_base') || lower.includes('schema cache')) {
    return 'Schema do banco desatualizado para produtos. Rode a migration 002_dashboard_producao.sql no Supabase.'
  }

  return errorMessage
}

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('produtos').select('*').order('nome')

  if (error) return NextResponse.json({ error: mensagemErroProduto(error.message) }, { status: 500 })
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
      volume_base: Number(body.volume_base ?? 3800),
      tempos_maquinas: body.tempos_maquinas ?? {},
      tempo_limpeza_min: 0,
      cor: body.cor ?? '#5B9BD5',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: mensagemErroProduto(error.message) }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { id, nome, volume_base, tempos_maquinas, cor } = await req.json()

  const updates: Record<string, unknown> = { tempo_limpeza_min: 0 }
  if (nome !== undefined) updates.nome = nome
  if (volume_base !== undefined) updates.volume_base = Number(volume_base)
  if (tempos_maquinas !== undefined) updates.tempos_maquinas = tempos_maquinas
  if (cor !== undefined) updates.cor = cor

  const { data, error } = await supabase
    .from('produtos')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: mensagemErroProduto(error.message) }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { id } = await req.json()

  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: mensagemErroProduto(error.message) }, { status: 400 })
  return NextResponse.json({ ok: true })
}
