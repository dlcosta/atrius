import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buscarItensDemanda } from '@/lib/demanda/itens'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const mostrarAlocados = searchParams.get('mostrar_alocados') === 'true'

  try {
    const itens = await buscarItensDemanda(supabase, mostrarAlocados)
    return NextResponse.json(itens)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
