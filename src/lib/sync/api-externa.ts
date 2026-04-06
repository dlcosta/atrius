// Formato que vem da API externa
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

export type OrdemParaUpsert = {
  numero_externo: string
  produto_sku: string
  maquina_externa_codigo: string | null
  quantidade: number
  unidade: string
  data_prevista: string
  status: 'aguardando'
  sincronizado_em: string
}

/** Extrai o código da máquina dos marcadores (ex: ["lt906","tq3","mq2"] → "mq2") */
export function extrairMaquinaId(marcadores: string[]): string | null {
  const maquina = marcadores.find((m) => /^mq\d+$/i.test(m))
  return maquina ?? null
}

/** Extrai o SKU da descrição (ex: "925 - DESINFETANTE..." → "925") */
export function extrairSku(descricao: string): string {
  const partes = descricao.split(' - ')
  return partes[0].trim()
}

/** Transforma ordem externa em formato pronto para upsert no Supabase */
export function transformOrdem(ordemExterna: OrdemExterna): OrdemParaUpsert {
  return {
    numero_externo: ordemExterna.numero,
    produto_sku: ordemExterna.sku || extrairSku(ordemExterna.descricao),
    maquina_externa_codigo: extrairMaquinaId(ordemExterna.marcadores),
    quantidade: ordemExterna.quantidade,
    unidade: ordemExterna.unidade,
    data_prevista: ordemExterna.data_prevista,
    status: 'aguardando',
    sincronizado_em: new Date().toISOString(),
  }
}

/** Busca ordens da API externa */
export async function fetchOrdensExternas(): Promise<OrdemExterna[]> {
  const res = await fetch(
    `${process.env.API_EXTERNA_URL}/ordens?status=em_aberto,em_andamento`,
    {
      headers: {
        Authorization: `Bearer ${process.env.API_EXTERNA_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!res.ok) {
    throw new Error(`API externa retornou ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  return Array.isArray(data) ? data : data.ordens ?? data.data ?? []
}
