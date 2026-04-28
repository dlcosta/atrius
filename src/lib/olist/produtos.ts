import { olistFetch } from './client'

export type ProdutoResumo = {
  id: number
  sku: string
  descricao: string
  tipo: string
  situacao: string
  dataCriacao: string | null
  dataAlteracao: string | null
  unidade: string
}

export type ProdutoDetalhe = {
  id: number
  sku: string
  descricao: string
  tipo: string
  situacao: string
  unidade: string
  preco: number
  precoCusto: number
  precoCustoMedio: number
  estoqueQuantidade: number
  estoqueLocalizacao: string
  dataCriacao: string | null
  dataAlteracao: string | null
}

export type ProdutoParaUpsert = {
  id_olist: number
  sku: string | null
  descricao: string
  tipo: string
  situacao: string
  unidade: string | null
  preco: number | null
  preco_custo: number | null
  preco_custo_medio: number | null
  estoque_quantidade: number | null
  estoque_localizacao: string | null
  data_criacao: string | null
  data_alteracao: string | null
  sincronizado_em: string
}

function parseDataOlist(val: unknown): string | null {
  if (!val || typeof val !== 'string' || val.trim() === '') return null
  return new Date(val).toISOString()
}

export async function listarProdutosIds(situacao?: 'A' | 'I' | 'E'): Promise<number[]> {
  const ids: number[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (situacao) params.set('situacao', situacao)

    const res = await olistFetch(`/produtos?${params.toString()}`)
    const json = await res.json()

    const itens: ProdutoResumo[] = json.itens ?? []
    ids.push(...itens.map((p) => p.id))

    const total: number = json.paginacao?.total ?? 0
    offset += limit

    if (offset >= total) break
  }

  return ids
}

export async function buscarProdutoDetalhe(id: number): Promise<ProdutoDetalhe> {
  const res = await olistFetch(`/produtos/${id}`)
  const j = await res.json()

  return {
    id: Number(j.id),
    sku: String(j.sku ?? ''),
    descricao: String(j.descricao ?? '').trim(),
    tipo: String(j.tipo ?? ''),
    situacao: String(j.situacao ?? ''),
    unidade: String(j.unidade ?? ''),
    preco: Number(j.precos?.preco ?? 0),
    precoCusto: Number(j.precos?.precoCusto ?? 0),
    precoCustoMedio: Number(j.precos?.precoCustoMedio ?? 0),
    estoqueQuantidade: Number(j.estoque?.quantidade ?? 0),
    estoqueLocalizacao: String(j.estoque?.localizacao ?? ''),
    dataCriacao: parseDataOlist(j.dataCriacao),
    dataAlteracao: parseDataOlist(j.dataAlteracao),
  }
}

export function produtoParaUpsert(p: ProdutoDetalhe): ProdutoParaUpsert {
  return {
    id_olist: p.id,
    sku: p.sku || null,
    descricao: p.descricao,
    tipo: p.tipo,
    situacao: p.situacao,
    unidade: p.unidade || null,
    preco: p.preco,
    preco_custo: p.precoCusto,
    preco_custo_medio: p.precoCustoMedio,
    estoque_quantidade: p.estoqueQuantidade,
    estoque_localizacao: p.estoqueLocalizacao || null,
    data_criacao: p.dataCriacao,
    data_alteracao: p.dataAlteracao,
    sincronizado_em: new Date().toISOString(),
  }
}
