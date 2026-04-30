import { olistFetch } from './client'

export const PEDIDO_SITUACOES = [8, 0, 3, 4, 1, 7, 5, 6, 2, 9] as const

export type PedidoSituacao = (typeof PEDIDO_SITUACOES)[number]

export type PedidoFiltro = {
  numero?: number
  nomeCliente?: string
  codigoCliente?: string
  cpfCnpj?: string
  dataInicial?: string
  dataFinal?: string
  dataAtualizacao?: string
  situacao?: PedidoSituacao
  numeroPedidoEcommerce?: string
  idVendedor?: number
  marcadores?: string[]
  origemPedido?: 0 | 1
  orderBy?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export type PedidoResumo = {
  id: number
  situacao: number | null
  numeroPedido: number | null
  dataCriacao: string | null
  dataPrevista: string | null
  cliente: {
    id: number | null
    nome: string | null
    codigo: string | null
    cpfCnpj: string | null
  }
  valor: number | null
  origemPedido: number | null
  ecommerce: {
    id: number | null
    nome: string | null
    numeroPedidoEcommerce: string | null
  } | null
}

export type PedidosPaginacao = {
  limit: number
  offset: number
  total: number
}

export type PedidosListagem = {
  itens: PedidoResumo[]
  paginacao: PedidosPaginacao
}

export type PedidoParaUpsert = {
  id_olist: number
  situacao: number | null
  numero_pedido: number | null
  data_criacao: string | null
  data_prevista: string | null
  cliente_id: number | null
  cliente_nome: string | null
  cliente_codigo: string | null
  cliente_cpf_cnpj: string | null
  valor: number | null
  origem_pedido: number | null
  ecommerce_id: number | null
  ecommerce_nome: string | null
  ecommerce_numero_pedido: string | null
  sincronizado_em: string
}

export type PedidoDetalheItem = {
  produto: {
    id: number | null
    sku: string | null
    descricao: string | null
    tipo: string | null
  }
  quantidade: number | null
  valorUnitario: number | null
  infoAdicional: string | null
}

export type PedidoDetalhe = {
  id: number
  numeroPedido: number | null
  itens: PedidoDetalheItem[]
}

export type PedidoItemParaUpsert = {
  pedido_id_olist: number
  item_sequencia: number
  produto_id_olist: number | null
  produto_sku: string | null
  produto_descricao: string | null
  produto_tipo: string | null
  quantidade: number | null
  valor_unitario: number | null
  info_adicional: string | null
  sincronizado_em: string
}

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseDecimal(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const normalized = value.replace(',', '.')
    const n = Number(normalized)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function isSituacaoValida(value: unknown): value is PedidoSituacao {
  return typeof value === 'number' && PEDIDO_SITUACOES.includes(value as PedidoSituacao)
}

export function buildPedidosQuery(filtro: PedidoFiltro = {}): URLSearchParams {
  const params = new URLSearchParams()

  if (typeof filtro.numero === 'number') params.set('numero', String(filtro.numero))
  if (filtro.nomeCliente) params.set('nomeCliente', filtro.nomeCliente)
  if (filtro.codigoCliente) params.set('codigoCliente', filtro.codigoCliente)
  if (filtro.cpfCnpj) params.set('cpfCnpj', filtro.cpfCnpj)
  if (filtro.dataInicial) params.set('dataInicial', filtro.dataInicial)
  if (filtro.dataFinal) params.set('dataFinal', filtro.dataFinal)
  if (filtro.dataAtualizacao) params.set('dataAtualizacao', filtro.dataAtualizacao)
  if (isSituacaoValida(filtro.situacao)) params.set('situacao', String(filtro.situacao))
  if (filtro.numeroPedidoEcommerce) params.set('numeroPedidoEcommerce', filtro.numeroPedidoEcommerce)
  if (typeof filtro.idVendedor === 'number') params.set('idVendedor', String(filtro.idVendedor))
  if (Array.isArray(filtro.marcadores)) {
    for (const marcador of filtro.marcadores) {
      const value = marcador.trim()
      if (value) params.append('marcadores', value)
    }
  }
  if (filtro.origemPedido === 0 || filtro.origemPedido === 1) {
    params.set('origemPedido', String(filtro.origemPedido))
  }
  if (filtro.orderBy === 'asc' || filtro.orderBy === 'desc') params.set('orderBy', filtro.orderBy)

  const limit = typeof filtro.limit === 'number' ? filtro.limit : 100
  const offset = typeof filtro.offset === 'number' ? filtro.offset : 0

  params.set('limit', String(Math.max(1, Math.min(limit, 100))))
  params.set('offset', String(Math.max(0, offset)))

  return params
}

function mapPedido(raw: unknown): PedidoResumo {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const clienteRaw = source.cliente
  const clienteObj = clienteRaw && typeof clienteRaw === 'object'
    ? (clienteRaw as Record<string, unknown>)
    : {}
  const ecommerceRaw = source.ecommerce
  const ecommerceObj = ecommerceRaw && typeof ecommerceRaw === 'object'
    ? (ecommerceRaw as Record<string, unknown>)
    : null

  return {
    id: parseInteger(source.id) ?? 0,
    situacao: parseInteger(source.situacao),
    numeroPedido: parseInteger(source.numeroPedido),
    dataCriacao: parseDate(source.dataCriacao),
    dataPrevista: parseDate(source.dataPrevista),
    cliente: {
      id: parseInteger(clienteObj.id),
      nome: typeof clienteObj.nome === 'string' ? clienteObj.nome : null,
      codigo: typeof clienteObj.codigo === 'string' ? clienteObj.codigo : null,
      cpfCnpj: typeof clienteObj.cpfCnpj === 'string' ? clienteObj.cpfCnpj : null,
    },
    valor: parseDecimal(source.valor),
    origemPedido: parseInteger(source.origemPedido),
    ecommerce: ecommerceObj
      ? {
          id: parseInteger(ecommerceObj.id),
          nome: typeof ecommerceObj.nome === 'string' ? ecommerceObj.nome : null,
          numeroPedidoEcommerce:
            typeof ecommerceObj.numeroPedidoEcommerce === 'string'
              ? ecommerceObj.numeroPedidoEcommerce
              : null,
        }
      : null,
  }
}

export async function listarPedidos(filtro: PedidoFiltro = {}): Promise<PedidosListagem> {
  const params = buildPedidosQuery(filtro)
  const res = await olistFetch(`/pedidos?${params.toString()}`)
  const json = await res.json()

  const itensRaw = Array.isArray(json?.itens) ? json.itens : []

  return {
    itens: itensRaw.map(mapPedido),
    paginacao: {
      limit: parseInteger(json?.paginacao?.limit) ?? 100,
      offset: parseInteger(json?.paginacao?.offset) ?? 0,
      total: parseInteger(json?.paginacao?.total) ?? itensRaw.length,
    },
  }
}

export function pedidoParaUpsert(p: PedidoResumo): PedidoParaUpsert {
  return {
    id_olist: p.id,
    situacao: p.situacao,
    numero_pedido: p.numeroPedido,
    data_criacao: p.dataCriacao,
    data_prevista: p.dataPrevista,
    cliente_id: p.cliente.id,
    cliente_nome: p.cliente.nome,
    cliente_codigo: p.cliente.codigo,
    cliente_cpf_cnpj: p.cliente.cpfCnpj,
    valor: p.valor,
    origem_pedido: p.origemPedido,
    ecommerce_id: p.ecommerce?.id ?? null,
    ecommerce_nome: p.ecommerce?.nome ?? null,
    ecommerce_numero_pedido: p.ecommerce?.numeroPedidoEcommerce ?? null,
    sincronizado_em: new Date().toISOString(),
  }
}

export async function obterPedido(idPedido: number): Promise<PedidoDetalhe> {
  const res = await olistFetch(`/pedidos/${idPedido}`)
  const json = await res.json()

  const itensRaw = Array.isArray(json?.itens) ? json.itens : []

  return {
    id: parseInteger(json?.id) ?? idPedido,
    numeroPedido: parseInteger(json?.numeroPedido),
    itens: itensRaw.map((item): PedidoDetalheItem => {
      const src = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      const produtoRaw = src.produto
      const produto = produtoRaw && typeof produtoRaw === 'object'
        ? (produtoRaw as Record<string, unknown>)
        : {}

      return {
        produto: {
          id: parseInteger(produto.id),
          sku: typeof produto.sku === 'string' ? produto.sku : null,
          descricao: typeof produto.descricao === 'string' ? produto.descricao : null,
          tipo: typeof produto.tipo === 'string' ? produto.tipo : null,
        },
        quantidade: parseDecimal(src.quantidade),
        valorUnitario: parseDecimal(src.valorUnitario),
        infoAdicional: typeof src.infoAdicional === 'string' ? src.infoAdicional : null,
      }
    }),
  }
}

export function itensPedidoParaUpsert(detalhe: PedidoDetalhe): PedidoItemParaUpsert[] {
  const sincronizadoEm = new Date().toISOString()
  return detalhe.itens.map((item, index) => ({
    pedido_id_olist: detalhe.id,
    item_sequencia: index + 1,
    produto_id_olist: item.produto.id,
    produto_sku: item.produto.sku,
    produto_descricao: item.produto.descricao,
    produto_tipo: item.produto.tipo,
    quantidade: item.quantidade,
    valor_unitario: item.valorUnitario,
    info_adicional: item.infoAdicional,
    sincronizado_em: sincronizadoEm,
  }))
}
