import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const inicio = searchParams.get('inicio')
  const fim = searchParams.get('fim')

  if (!inicio || !fim) {
    return NextResponse.json({ error: 'inicio e fim sao obrigatorios' }, { status: 422 })
  }

  if (!DATE_REGEX.test(inicio) || !DATE_REGEX.test(fim)) {
    return NextResponse.json({ error: 'inicio ou fim invalido' }, { status: 422 })
  }

  if (inicio > fim) {
    return NextResponse.json({ error: 'inicio deve ser menor ou igual ao fim' }, { status: 422 })
  }

  const inicioIso = `${inicio}T00:00:00.000Z`
  const fimIso = `${fim}T23:59:59.999Z`

  const withOperator = await supabase
    .from('eventos_timer')
    .select('id, ordem_id, maquina_id, tipo, timestamp, operador_nome')
    .gte('timestamp', inicioIso)
    .lte('timestamp', fimIso)
    .order('timestamp', { ascending: true })
  if (!withOperator.error) {
    return NextResponse.json(withOperator.data ?? [])
  }

  if (!withOperator.error.message.includes('operador_nome')) {
    return NextResponse.json({ error: withOperator.error.message }, { status: 500 })
  }

  const fallback = await supabase
    .from('eventos_timer')
    .select('id, ordem_id, maquina_id, tipo, timestamp')
    .gte('timestamp', inicioIso)
    .lte('timestamp', fimIso)
    .order('timestamp', { ascending: true })
  if (fallback.error) {
    return NextResponse.json({ error: fallback.error.message }, { status: 500 })
  }

  const normalized = (fallback.data ?? []).map((evento) => ({
    ...evento,
    operador_nome: null,
  }))

  return NextResponse.json(normalized)
}
