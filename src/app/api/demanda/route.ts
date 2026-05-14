import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ItemDemanda } from '@/types'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const mostrarAlocados = searchParams.get('mostrar_alocados') === 'true'

  const { data: rows, error } = await supabase.rpc('demanda_itens_pendentes', {
    p_mostrar_alocados: mostrarAlocados,
  })

  if (error) {
    return NextResponse.json(
      { error: `Erro ao buscar demanda: ${error.message}. Verifique se a função demanda_itens_pendentes existe no Supabase.` },
      { status: 500 }
    )
  }

  return NextResponse.json(rows as ItemDemanda[])
}
