import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listarPedidos, pedidoParaUpsert } from '@/lib/olist/pedidos'
import { OlistAuthError, OlistApiError } from '@/lib/olist/errors'

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const params = request.nextUrl.searchParams
    const mode = params.get('mode') ?? 'backfill'

    const limit = Math.min(parsePositiveInt(params.get('limit'), 100), 100)
    const pages = parsePositiveInt(params.get('pages'), 40)

    const primeiraPage = await listarPedidos({ limit, offset: 0, orderBy: 'desc' })
    const total = primeiraPage.paginacao.total

    let startOffset = 0

    if (mode === 'backfill') {
      const { count, error: countError } = await supabase
        .from('pedidos_erp')
        .select('*', { count: 'exact', head: true })

      if (countError) {
        throw new Error(`Erro ao contar pedidos_erp: ${countError.message}`)
      }

      startOffset = count ?? 0
      if (startOffset >= total) {
        return NextResponse.json({
          mode,
          total_api: total,
          start_offset: startOffset,
          importados: 0,
          erros: 0,
          no_op: true,
        })
      }
    }

    const maxPages = mode === 'full' ? Math.ceil(total / limit) : pages

    let importados = 0
    let erros = 0
    let pagesProcessadas = 0

    for (let i = 0; i < maxPages; i++) {
      const offset = startOffset + i * limit
      if (offset >= total) break

      const page = offset === 0
        ? primeiraPage
        : await listarPedidos({ limit, offset, orderBy: 'desc' })

      if (page.itens.length === 0) break

      const rows = page.itens.map(pedidoParaUpsert)
      const { error } = await supabase
        .from('pedidos_erp')
        .upsert(rows, { onConflict: 'id_olist' })

      pagesProcessadas++

      if (error) {
        console.error(`Erro upsert pedidos offset ${offset}:`, error.message)
        erros += rows.length
        continue
      }

      importados += rows.length
    }

    return NextResponse.json({
      mode,
      total_api: total,
      start_offset: startOffset,
      pages_processadas: pagesProcessadas,
      importados,
      erros,
    })
  } catch (err) {
    if (err instanceof OlistAuthError) {
      return NextResponse.json(
        { error: 'Olist nao conectado. Acesse /admin/olist para reconectar.' },
        { status: 401 }
      )
    }

    if (err instanceof OlistApiError) {
      return NextResponse.json(
        { error: `API Olist retornou ${err.status}` },
        { status: 502 }
      )
    }

    console.error('Erro na sincronizacao de pedidos:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
