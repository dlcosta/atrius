import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularFim, detectarConflito } from '@/lib/planning/engine'
import type { Ordem } from '@/types'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const data = searchParams.get('data')

  let query = supabase
    .from('ordens')
    .select('*, produto:produtos(*), maquina:maquinas(*)')
    .not('status', 'in', '(concluida,cancelada)')
    .order('inicio_agendado', { ascending: true, nullsFirst: false })

  if (data) {
    query = query.or(`data_prevista.eq.${data},inicio_agendado.is.null`)
  }

  const { data: ordens, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(ordens)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()
  const { id, inicio_agendado, maquina_id } = body

  // If unsetting the schedule (desagendar)
  if (!inicio_agendado) {
    const { data: updated, error } = await supabase
      .from('ordens')
      .update({ maquina_id: null, inicio_agendado: null, fim_calculado: null })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(updated)
  }

  // Fetch product to calculate end time
  const { data: ordemData } = await supabase
    .from('ordens')
    .select('produto_sku, produto:produtos(tempo_producao_min)')
    .eq('id', id)
    .single()

  if (!ordemData) return NextResponse.json({ error: 'Ordem não encontrada' }, { status: 404 })

  const produto = Array.isArray(ordemData.produto) ? ordemData.produto[0] : ordemData.produto
  const inicio = new Date(inicio_agendado)
  const fim = calcularFim(inicio, produto.tempo_producao_min)

  // Check for conflicts
  const { data: ordensExistentes } = await supabase
    .from('ordens')
    .select('id, maquina_id, inicio_agendado, fim_calculado')
    .eq('maquina_id', maquina_id)
    .not('id', 'eq', id)
    .not('inicio_agendado', 'is', null)

  const candidata: Ordem = {
    id,
    numero_externo: '',
    produto_sku: null,
    maquina_id,
    quantidade: 0,
    unidade: '',
    data_prevista: null,
    inicio_agendado: inicio.toISOString(),
    fim_calculado: fim.toISOString(),
    status: 'aguardando',
    sincronizado_em: '',
  }

  if (detectarConflito(candidata, (ordensExistentes as Ordem[]) ?? [])) {
    return NextResponse.json({ error: 'Conflito de horário nessa máquina' }, { status: 409 })
  }

  const { data: updated, error } = await supabase
    .from('ordens')
    .update({
      maquina_id,
      inicio_agendado: inicio.toISOString(),
      fim_calculado: fim.toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(updated)
}
