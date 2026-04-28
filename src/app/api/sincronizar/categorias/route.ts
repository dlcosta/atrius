import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchCategoriasArvore, flattenCategoriasArvore } from '@/lib/olist/categorias'
import { OlistAuthError, OlistApiError } from '@/lib/olist/errors'

export async function POST() {
  try {
    const supabase = await createClient()
    const categorias = await fetchCategoriasArvore()
    const categoriasUpsert = flattenCategoriasArvore(categorias)

    const { error } = await supabase.from('categorias_erp').upsert(categoriasUpsert, {
      onConflict: 'id',
    })

    if (error) throw new Error(error.message)

    return NextResponse.json({
      categorias_raiz: categorias.length,
      importadas: categoriasUpsert.length,
    })
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

    console.error('Erro na sincronizacao de categorias:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
