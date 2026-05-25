import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listarPedidos, pedidoParaUpsert } from '@/lib/olist/pedidos'
import { OlistAuthError, OlistApiError } from '@/lib/olist/errors'

const CHECKPOINT_KEY = 'pedidos_data_atualizacao'

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function carregarPedidosExistentes(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const ids = new Set<number>()
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('pedidos_erp')
      .select('id_olist')
      .range(from, from + pageSize - 1)

    if (error) throw error

    data?.forEach((pedido) => ids.add(Number(pedido.id_olist)))

    if (!data || data.length < pageSize) break
  }

  return ids
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const params = request.nextUrl.searchParams
    const mode = params.get('mode') === 'full' ? 'full' : 'incremental'
    const numeroPedido = parsePositiveInt(params.get('numero'), 0)

    const limit = Math.min(parsePositiveInt(params.get('limit'), 100), 100)
    const pages = parsePositiveInt(params.get('pages'), mode === 'full' ? 100000 : 40)

    if (numeroPedido > 0) {
      const page = await listarPedidos({
        numero: numeroPedido,
        limit: 1,
        offset: 0,
      })

      if (page.itens.length === 0) {
        return NextResponse.json({
          mode: 'pedido',
          numero_pedido: numeroPedido,
          importados: 0,
          erros: 0,
          encontrado: false,
        })
      }

      const rows = page.itens.map(pedidoParaUpsert)
      const { error } = await supabase
        .from('pedidos_erp')
        .upsert(rows, { onConflict: 'id_olist' })

      if (error) throw new Error(`Erro upsert pedido ${numeroPedido}: ${error.message}`)

      return NextResponse.json({
        mode: 'pedido',
        numero_pedido: numeroPedido,
        importados: rows.length,
        erros: 0,
        encontrado: true,
      })
    }

    let checkpointAnterior: string | null = null
    const pedidosExistentes = mode === 'incremental'
      ? await carregarPedidosExistentes(supabase)
      : new Set<number>()

    if (mode === 'incremental') {
      const { data, error } = await supabase
        .from('sincronizacao_erp_controle')
        .select('valor_texto')
        .eq('chave', CHECKPOINT_KEY)
        .limit(1)

      if (error) throw new Error(`Falha ao ler checkpoint de pedidos: ${error.message}`)

      checkpointAnterior = data?.[0]?.valor_texto ?? null
    }

    let total = 0
    let importados = 0
    let pulados = 0
    let erros = 0
    let pagesProcessadas = 0

    for (let i = 0; i < pages; i++) {
      const offset = i * limit
      const page = await listarPedidos({
        limit,
        offset,
        orderBy: 'desc',
        dataAtualizacao: mode === 'incremental' ? checkpointAnterior ?? undefined : undefined,
      })

      if (i === 0) {
        total = page.paginacao.total
      }

      if (page.itens.length === 0) break

      const pedidosParaImportar = mode === 'incremental' && !checkpointAnterior
        ? page.itens.filter((pedido) => {
            if (pedidosExistentes.has(pedido.id)) {
              pulados++
              return false
            }
            return true
          })
        : page.itens

      if (pedidosParaImportar.length > 0) {
        const rows = pedidosParaImportar.map(pedidoParaUpsert)
        const { error } = await supabase
          .from('pedidos_erp')
          .upsert(rows, { onConflict: 'id_olist' })

        if (error) {
          console.error(`Erro upsert pedidos offset ${offset}:`, error.message)
          erros += rows.length
        } else {
          importados += rows.length
        }
      }

      pagesProcessadas++
      if (offset + limit >= page.paginacao.total) break
    }

    if (mode === 'incremental') {
      const checkpointNovo = formatDateYmd(new Date(Date.now() - 24 * 60 * 60 * 1000))
      const { error: checkpointError } = await supabase
        .from('sincronizacao_erp_controle')
        .upsert(
          {
            chave: CHECKPOINT_KEY,
            valor_texto: checkpointNovo,
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: 'chave' }
        )

      if (checkpointError) {
        throw new Error(`Falha ao atualizar checkpoint de pedidos: ${checkpointError.message}`)
      }

      return NextResponse.json({
        mode,
        checkpoint_anterior: checkpointAnterior,
        checkpoint_novo: checkpointNovo,
        total_api: total,
        pages_processadas: pagesProcessadas,
        importados,
        pulados,
        erros,
      })
    }

    return NextResponse.json({
      mode,
      total_api: total,
      pages_processadas: pagesProcessadas,
      importados,
      pulados,
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
