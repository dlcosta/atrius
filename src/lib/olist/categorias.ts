import { olistFetch } from './client'

export type CategoriaArvore = {
  id: number
  descricao: string
  filhas: CategoriaArvore[]
}

export type Categoria = {
  id: number
  descricao: string
  categoriaPai: { id: number; descricao: string } | null
  filhas: CategoriaArvore[]
}

export type CategoriaParaUpsert = {
  id: number
  descricao: string
  categoria_pai_id: number | null
  nivel: number
  caminho: string
  filhas_count: number
  sincronizado_em: string
}

export function parseCategoriaNode(rawNode: unknown): CategoriaArvore {
  if (!rawNode || typeof rawNode !== 'object') {
    throw new Error('Resposta de categoria invalida: item nao e objeto.')
  }

  const candidate = rawNode as Record<string, unknown>
  const id = Number(candidate.id)
  const descricao = String(candidate.descricao ?? '').trim()
  const filhasRaw = Array.isArray(candidate.filhas) ? candidate.filhas : []

  if (!Number.isFinite(id)) {
    throw new Error('Resposta de categoria invalida: campo id ausente ou invalido.')
  }

  if (!descricao) {
    throw new Error(`Resposta de categoria invalida: descricao ausente na categoria ${id}.`)
  }

  return {
    id,
    descricao,
    filhas: filhasRaw.map(parseCategoriaNode),
  }
}

export function extrairCategoriasResposta(payload: unknown): CategoriaArvore[] {
  if (Array.isArray(payload)) {
    return payload.map(parseCategoriaNode)
  }

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>

    for (const chave of ['categorias', 'data', 'itens', 'items']) {
      if (Array.isArray(obj[chave])) {
        return (obj[chave] as unknown[]).map(parseCategoriaNode)
      }
    }

    if ('id' in obj && 'descricao' in obj) {
      return [parseCategoriaNode(obj)]
    }
  }

  throw new Error('Formato de resposta da API de categorias nao reconhecido.')
}

export async function fetchCategoriasArvore(): Promise<CategoriaArvore[]> {
  const res = await olistFetch('/categorias/todas')
  return extrairCategoriasResposta(await res.json())
}

export async function getCategoria(id: number): Promise<Categoria> {
  const res = await olistFetch(`/categorias/${id}`)
  const json = await res.json()

  return {
    id: Number(json.id),
    descricao: String(json.descricao ?? '').trim(),
    categoriaPai: json.categoriaPai
      ? { id: Number(json.categoriaPai.id), descricao: String(json.categoriaPai.descricao) }
      : null,
    filhas: Array.isArray(json.filhas) ? json.filhas.map(parseCategoriaNode) : [],
  }
}

export function flattenCategoriasArvore(categorias: CategoriaArvore[]): CategoriaParaUpsert[] {
  const linhas: CategoriaParaUpsert[] = []
  const sincronizadoEm = new Date().toISOString()

  function visitar(
    categoria: CategoriaArvore,
    categoriaPaiId: number | null,
    caminhoPai: string[],
    nivel: number
  ) {
    const caminhoPartes = [...caminhoPai, categoria.descricao]

    linhas.push({
      id: categoria.id,
      descricao: categoria.descricao,
      categoria_pai_id: categoriaPaiId,
      nivel,
      caminho: caminhoPartes.join(' > '),
      filhas_count: categoria.filhas.length,
      sincronizado_em: sincronizadoEm,
    })

    categoria.filhas.forEach((filha) =>
      visitar(filha, categoria.id, caminhoPartes, nivel + 1)
    )
  }

  categorias.forEach((categoria) => visitar(categoria, null, [], 0))

  return linhas
}
