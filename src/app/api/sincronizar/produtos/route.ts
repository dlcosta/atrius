import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listarProdutosIds, buscarProdutoDetalhe, produtoParaUpsert } from '@/lib/olist/produtos'
import { OlistAuthError, OlistApiError } from '@/lib/olist/errors'

export async function POST() {
  try {
    const supabase = await createClient()
    const ids = await listarProdutosIds()

    let importados = 0
    let erros = 0

    for (const id of ids) {
      try {
        const detalhe = await buscarProdutoDetalhe(id)
        const row = produtoParaUpsert(detalhe)

        const { error } = await supabase
          .from('produtos_erp')
          .upsert(row, { onConflict: 'id_olist' })

        if (error) {
          console.error(`Erro upsert produto ${id}:`, error.message)
          erros++
        } else {
          importados++
        }
      } catch (err) {
        console.error(`Erro ao buscar produto ${id}:`, err)
        erros++
      }
    }

    return NextResponse.json({ total: ids.length, importados, erros })
  } catch (err) {
    if (err instanceof OlistAuthError) {
      return NextResponse.json(
        { error: 'Olist não conectado. Acesse /admin/olist para reconectar.' },
        { status: 401 }
      )
    }

    if (err instanceof OlistApiError) {
      return NextResponse.json(
        { error: `API Olist retornou ${err.status}` },
        { status: 502 }
      )
    }

    console.error('Erro na sincronizacao de produtos:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
