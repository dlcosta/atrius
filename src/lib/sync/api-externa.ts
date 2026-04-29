import { inferirEtapa } from '@/lib/ordens/volume'
import type { EtapaOrdem } from '@/types'

// Formato esperado da API externa
export type OrdemExterna = {
  numero: string
  data: string
  data_prevista: string
  sku: string
  descricao: string
  quantidade: number
  unidade: string
  marcadores: string[]
  status: string
}

type OrdemParaUpsert = {
  numero_externo: string
  produto_sku: string
  maquina_externa_codigo: string | null
  quantidade: number
  unidade: string
  data_prevista: string
  tanque: string | null
  lote: string | null
  etapa: EtapaOrdem
  status: 'aguardando'
  sincronizado_em: string
}

function normalizarMarcador(marcador: string): string {
  return marcador.trim().toLowerCase()
}

/** Extrai o codigo da maquina dos marcadores (ex: ['lt906','tq3','mq2'] -> 'mq2') */
export function extrairMaquinaId(marcadores: string[]): string | null {
  const maquina = marcadores.map(normalizarMarcador).find((m) => /^mq\d+$/i.test(m))
  return maquina ?? null
}

/** Extrai o marcador de tanque (ex: ['lt906','tq3','mq2'] -> 'tq3') */
export function extrairTanque(marcadores: string[]): string | null {
  const tanque = marcadores.map(normalizarMarcador).find((m) => /^tq\d+$/i.test(m))
  return tanque ?? null
}

/** Extrai o marcador de lote (ex: ['lt906','tq3','mq2'] -> 'lt906') */
export function extrairLote(marcadores: string[]): string | null {
  const lote = marcadores.map(normalizarMarcador).find((m) => /^lt\d+$/i.test(m))
  return lote ?? null
}

/** Extrai o SKU da descricao (ex: '925 - DESINFETANTE...' -> '925') */
export function extrairSku(descricao: string): string {
  const partes = descricao.split(' - ')
  return partes[0].trim()
}

function inferirEtapaExterna(ordemExterna: OrdemExterna): EtapaOrdem {
  return inferirEtapa(ordemExterna.sku, ordemExterna.unidade)
}

/** Transforma ordem externa em formato pronto para upsert no Supabase */
export function transformOrdem(ordemExterna: OrdemExterna): OrdemParaUpsert {
  return {
    numero_externo: ordemExterna.numero,
    produto_sku: ordemExterna.sku || extrairSku(ordemExterna.descricao),
    maquina_externa_codigo: extrairMaquinaId(ordemExterna.marcadores),
    quantidade: ordemExterna.quantidade,
    unidade: (ordemExterna.unidade ?? 'UN').trim().toUpperCase(),
    data_prevista: ordemExterna.data_prevista,
    tanque: extrairTanque(ordemExterna.marcadores),
    lote: extrairLote(ordemExterna.marcadores),
    etapa: inferirEtapaExterna(ordemExterna),
    status: 'aguardando',
    sincronizado_em: new Date().toISOString(),
  }
}

/** Busca ordens da API externa */
export async function fetchOrdensExternas(): Promise<OrdemExterna[]> {
  const rawUrl = process.env.API_EXTERNA_URL
  if (!rawUrl) {
    console.warn('API_EXTERNA_URL não definida, retornando lista vazia.')
    return []
  }

  const baseUrl = rawUrl.replace(/\/$/, '')
  const isSupabase = baseUrl.includes('supabase.co')
  const path = isSupabase ? '/rest/v1/ordens' : '/ordens'
  const filter = isSupabase ? 'status=in.(em_aberto,em_andamento)' : 'status=em_aberto,em_andamento'

  const url = `${baseUrl}${path}?${filter}`

  try {
    const res = await fetch(url, {
      headers: {
        ...(isSupabase ? { 'apikey': process.env.API_EXTERNA_KEY! } : {}),
        Authorization: `Bearer ${process.env.API_EXTERNA_KEY}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`API externa retornou ${res.status}: ${errorText}`)
    }

    const data = await res.json()
    return Array.isArray(data) ? data : data.ordens ?? data.data ?? []
  } catch (error) {
    console.error(`Erro ao buscar ordens externas de ${url}:`, error)
    if (error instanceof TypeError && error.message.includes('fetch failed')) {
      throw new Error(`Erro de conexão com a API externa (${baseUrl}). Verifique se o serviço está online.`)
    }
    throw error
  }
}
