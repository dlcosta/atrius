import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  listarPedidos,
  obterPedido,
  itensPedidoParaUpsert,
  pedidoParaUpsert,
  type PedidoResumo,
} from '@/lib/olist/pedidos'
import { OlistAuthError, OlistApiError } from '@/lib/olist/errors'

const CHECKPOINT_DATE_KEY = 'pedidos_itens_data_atualizacao'
const CHECKPOINT_FULL_OFFSET_KEY = 'pedidos_itens_full_offset'

function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

async function processPedido(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pedidoResumo: PedidoResumo
): Promise<{ ok: boolean; itens: number; error?: string }> {
  function isRateLimitError(error: unknown): boolean {
    const message = String(error ?? '')
    return message.includes('429')
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  try {
    const pedidoRow = pedidoParaUpsert(pedidoResumo)
    const { error: pedidoError } = await supabase
      .from('pedidos_erp')
      .upsert(pedidoRow, { onConflict: 'id_olist' })

    if (pedidoError) {
      return { ok: false, itens: 0, error: `Erro upsert pedido ${pedidoResumo.id}: ${pedidoError.message}` }
    }

    let detalhe = null
    let lastError: unknown = null

    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        detalhe = await obterPedido(pedidoResumo.id)
        break
      } catch (error) {
        lastError = error
        if (!isRateLimitError(error) || tentativa === 4) {
          break
        }
        await delay(800 * tentativa)
      }
    }

    if (!detalhe) {
      return {
        ok: false,
        itens: 0,
        error: `Erro detalhe pedido ${pedidoResumo.id}: ${String(lastError)}`,
      }
    }

    const itens = itensPedidoParaUpsert(detalhe)

    const { error: delError } = await supabase
      .from('pedidos_erp_itens')
      .delete()
      .eq('pedido_id_olist', detalhe.id)

    if (delError) {
      return { ok: false, itens: 0, error: `Erro removendo itens do pedido ${detalhe.id}: ${delError.message}` }
    }

    if (itens.length > 0) {
      const { error: insError } = await supabase
        .from('pedidos_erp_itens')
        .insert(itens)

      if (insError) {
        return { ok: false, itens: 0, error: `Erro inserindo itens do pedido ${detalhe.id}: ${insError.message}` }
      }
    }

    return { ok: true, itens: itens.length }
  } catch (error) {
    return { ok: false, itens: 0, error: String(error) }
  }
}

async function processPedidosConcurrently(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pedidos: PedidoResumo[],
  concurrency: number
): Promise<{ pedidosProcessados: number; itensImportados: number; erros: number }> {
  let index = 0
  let pedidosProcessados = 0
  let itensImportados = 0
  let erros = 0

  async function worker() {
    while (true) {
      const current = index
      index++
      if (current >= pedidos.length) break

      const pedido = pedidos[current]
      const result = await processPedido(supabase, pedido)

      if (result.ok) {
        pedidosProcessados++
        itensImportados += result.itens
      } else {
        erros++
        console.error(`Erro ao sincronizar itens do pedido ${pedido.id}:`, result.error)
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker())
  await Promise.all(workers)

  return { pedidosProcessados, itensImportados, erros }
}

async function carregarPedidosComItensExistentes(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const ids = new Set<number>()
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('pedidos_erp_itens')
      .select('pedido_id_olist')
      .range(from, from + pageSize - 1)

    if (error) throw error

    data?.forEach((item) => ids.add(Number(item.pedido_id_olist)))

    if (!data || data.length < pageSize) break
  }

  return ids
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const search = request.nextUrl.searchParams

    const full = search.get('full') === '1'
    const limit = Math.min(parsePositiveInt(search.get('limit'), 100), 100)
    const pages = parsePositiveInt(search.get('pages'), full ? 5 : 3)
    const concurrency = Math.min(parsePositiveInt(search.get('concurrency'), 1), 12)

    let offsetInicial = 0
    let checkpointAnterior: string | null = null
    let pedidosComItensExistentes = new Set<number>()

    if (full) {
      const { data, error } = await supabase
        .from('sincronizacao_erp_controle')
        .select('valor_texto')
        .eq('chave', CHECKPOINT_FULL_OFFSET_KEY)
        .limit(1)

      if (error) throw new Error(`Falha ao ler checkpoint full: ${error.message}`)

      offsetInicial = Number(data?.[0]?.valor_texto ?? 0)
      if (!Number.isFinite(offsetInicial) || offsetInicial < 0) offsetInicial = 0
    } else {
      const { data, error } = await supabase
        .from('sincronizacao_erp_controle')
        .select('valor_texto')
        .eq('chave', CHECKPOINT_DATE_KEY)
        .limit(1)

      if (error) throw new Error(`Falha ao ler checkpoint incremental: ${error.message}`)

      checkpointAnterior = data?.[0]?.valor_texto ?? null

      if (!checkpointAnterior) {
        pedidosComItensExistentes = await carregarPedidosComItensExistentes(supabase)
      }
    }

    let totalPedidosEncontrados = 0
    let pedidosProcessados = 0
    let itensImportados = 0
    let erros = 0
    let pulados = 0
    let pagesProcessadas = 0
    let offsetAtual = offsetInicial

    for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
      const page = await listarPedidos({
        limit,
        offset: offsetAtual,
        orderBy: 'desc',
        dataAtualizacao: full ? undefined : checkpointAnterior ?? undefined,
      })

      if (pageIndex === 0) {
        totalPedidosEncontrados = page.paginacao.total
      }

      if (page.itens.length === 0) break

      const pedidosParaProcessar = !full && !checkpointAnterior
        ? page.itens.filter((pedido) => {
            if (pedidosComItensExistentes.has(pedido.id)) {
              pulados++
              return false
            }
            return true
          })
        : page.itens

      const result = await processPedidosConcurrently(supabase, pedidosParaProcessar, concurrency)
      pedidosProcessados += result.pedidosProcessados
      itensImportados += result.itensImportados
      erros += result.erros
      pagesProcessadas++

      offsetAtual += limit
      if (offsetAtual >= page.paginacao.total) break
    }

    if (full) {
      const total = totalPedidosEncontrados || 0
      const finalizado = offsetAtual >= total
      const proximoOffset = finalizado ? 0 : offsetAtual

      const { error: ckError } = await supabase
        .from('sincronizacao_erp_controle')
        .upsert(
          {
            chave: CHECKPOINT_FULL_OFFSET_KEY,
            valor_texto: String(proximoOffset),
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: 'chave' }
        )

      if (ckError) throw new Error(`Falha ao atualizar checkpoint full: ${ckError.message}`)

      return NextResponse.json({
        modo: 'full',
        total_pedidos_encontrados: totalPedidosEncontrados,
        offset_inicial: offsetInicial,
        offset_proximo: proximoOffset,
        finalizado,
        pages_processadas: pagesProcessadas,
        pedidos_processados: pedidosProcessados,
        itens_importados: itensImportados,
        erros,
      })
    }

    const checkpointNovo = formatDateYmd(new Date(Date.now() - 24 * 60 * 60 * 1000))

    const { error: checkpointError } = await supabase
      .from('sincronizacao_erp_controle')
      .upsert(
        {
          chave: CHECKPOINT_DATE_KEY,
          valor_texto: checkpointNovo,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'chave' }
      )

    if (checkpointError) {
      throw new Error(`Falha ao atualizar checkpoint incremental: ${checkpointError.message}`)
    }

    return NextResponse.json({
      modo: 'incremental',
      checkpoint_anterior: checkpointAnterior,
      checkpoint_novo: checkpointNovo,
      total_pedidos_encontrados: totalPedidosEncontrados,
      pages_processadas: pagesProcessadas,
      pedidos_processados: pedidosProcessados,
      itens_importados: itensImportados,
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

    console.error('Erro na sincronizacao de itens dos pedidos:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
