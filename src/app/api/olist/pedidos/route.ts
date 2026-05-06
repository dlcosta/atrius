import { NextRequest, NextResponse } from 'next/server'
import { listarPedidos, type PedidoFiltro, PEDIDO_SITUACOES } from '@/lib/olist/pedidos'
import { OlistAuthError, OlistApiError } from '@/lib/olist/errors'

function parseInteger(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function parseSituacao(value: string | null): PedidoFiltro['situacao'] {
  if (!value) return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  return PEDIDO_SITUACOES.includes(n as (typeof PEDIDO_SITUACOES)[number])
    ? (n as PedidoFiltro['situacao'])
    : undefined
}

function parseOrigemPedido(value: string | null): PedidoFiltro['origemPedido'] {
  if (value === '0') return 0
  if (value === '1') return 1
  return undefined
}

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams
    const orderBy = search.get('orderBy')

    const filtro: PedidoFiltro = {
      numero: parseInteger(search.get('numero')),
      nomeCliente: search.get('nomeCliente') ?? undefined,
      codigoCliente: search.get('codigoCliente') ?? undefined,
      cpfCnpj: search.get('cpfCnpj') ?? undefined,
      dataInicial: search.get('dataInicial') ?? undefined,
      dataFinal: search.get('dataFinal') ?? undefined,
      dataAtualizacao: search.get('dataAtualizacao') ?? undefined,
      situacao: parseSituacao(search.get('situacao')),
      numeroPedidoEcommerce: search.get('numeroPedidoEcommerce') ?? undefined,
      idVendedor: parseInteger(search.get('idVendedor')),
      marcadores: search.getAll('marcadores'),
      origemPedido: parseOrigemPedido(search.get('origemPedido')),
      orderBy: orderBy === 'asc' || orderBy === 'desc' ? orderBy : undefined,
      limit: parseInteger(search.get('limit')),
      offset: parseInteger(search.get('offset')),
    }

    const listagem = await listarPedidos(filtro)

    return NextResponse.json(listagem)
  } catch (err) {
    if (err instanceof OlistAuthError) {
      return NextResponse.json(
        { error: 'Olist nao conectado. Acesse /admin/olist para reconectar.' },
        { status: 401 }
      )
    }

    if (err instanceof OlistApiError) {
      return NextResponse.json(
        { error: `API Olist retornou ${err.status}`, detalhe: err.body },
        { status: 502 }
      )
    }

    console.error('Erro ao listar pedidos da Olist:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
