import type { SupabaseClient } from '@supabase/supabase-js'
import type { ItemDemanda } from '../../types'

type PedidoItemView = {
  pedido_situacao: number | null
  numero_pedido: number | string | null
  data_criacao: string | null
  data_prevista: string | null
  cliente_nome: string | null
  produto_descricao: string | null
  quantidade: number | null
}

type OrdemPedido = {
  ordem_id: string
  numero_pedido: string
  produto_descricao: string
}

type OrdemStatus = {
  id: string
  planning_status: string | null
}

function categoriaProduto(descricao: string): string {
  return descricao
    .replace(/[ \t]+[0-9]+[ \t]*(ML|L|LT|LTS|KG|G)([ \t]|$)/gi, ' ')
    .replace(/[ \t]*-[ \t]*(CX|FD)[ \t].*/gi, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function litrosPorUnidade(descricao: string): number {
  if (/500[ \t]*ML/i.test(descricao)) return 0.5
  if (/[ \t]1[ \t]*(L|LT|LTS)/i.test(descricao)) return 1
  if (/[ \t]2[ \t]*(L|LT|LTS)/i.test(descricao)) return 2
  if (/[ \t]5[ \t]*(L|LT|LTS)/i.test(descricao)) return 5
  return 0
}

function unidadesPorEmbalagem(descricao: string): number {
  if (/C\/[ \t]*24[ \t]*UN/i.test(descricao)) return 24
  if (/C\/[ \t]*12[ \t]*UN/i.test(descricao)) return 12
  if (/C\/[ \t]*6[ \t]*UN/i.test(descricao)) return 6
  if (/C\/[ \t]*4[ \t]*UN/i.test(descricao)) return 4
  return 1
}

async function carregarAlocacoes(supabase: SupabaseClient) {
  const { data: alocacoes, error: alocacoesError } = await supabase
    .from('ordens_pedidos_erp')
    .select('ordem_id, numero_pedido, produto_descricao')

  if (alocacoesError) {
    console.error('[demanda] erro ao buscar alocacoes:', alocacoesError.message)
    return new Map<string, { ordem_id: string; ordem_status: string | null }>()
  }

  const ordemIds = Array.from(new Set((alocacoes as OrdemPedido[] | null)?.map((a) => a.ordem_id) ?? []))
  const statusPorOrdem = new Map<string, string | null>()

  if (ordemIds.length > 0) {
    const { data: ordens, error: ordensError } = await supabase
      .from('ordens')
      .select('id, planning_status')
      .in('id', ordemIds)

    if (ordensError) {
      console.error('[demanda] erro ao buscar status das ordens:', ordensError.message)
    } else {
      ;(ordens as OrdemStatus[] | null)?.forEach((ordem) => {
        statusPorOrdem.set(ordem.id, ordem.planning_status)
      })
    }
  }

  const alocacoesPorItem = new Map<string, { ordem_id: string; ordem_status: string | null }>()

  ;(alocacoes as OrdemPedido[] | null)?.forEach((alocacao) => {
    const ordemStatus = statusPorOrdem.get(alocacao.ordem_id) ?? null
    if (ordemStatus === 'CANCELED') return
    alocacoesPorItem.set(`${alocacao.numero_pedido}::${alocacao.produto_descricao}`, {
      ordem_id: alocacao.ordem_id,
      ordem_status: ordemStatus,
    })
  })

  return alocacoesPorItem
}

export async function buscarItensDemanda(
  supabase: SupabaseClient,
  mostrarAlocados = false
): Promise<ItemDemanda[]> {
  const { data, error } = await supabase
    .from('v_pedidos_erp_com_itens')
    .select('pedido_situacao, numero_pedido, data_criacao, data_prevista, cliente_nome, produto_descricao, quantidade')

  if (error) {
    throw new Error(`Erro ao buscar demanda na view v_pedidos_erp_com_itens: ${error.message}`)
  }

  const alocacoes = await carregarAlocacoes(supabase)
  const agrupados = new Map<string, ItemDemanda>()

  ;((data ?? []) as PedidoItemView[]).forEach((row) => {
    const produtoDescricao = String(row.produto_descricao ?? '').trim()
    const numeroPedido = String(row.numero_pedido ?? '')
    if (!produtoDescricao || !numeroPedido) return

    const categoria = categoriaProduto(produtoDescricao)
    const litros = litrosPorUnidade(produtoDescricao)
    const unidades = unidadesPorEmbalagem(produtoDescricao)
    const key = [
      row.data_prevista ?? '',
      categoria,
      produtoDescricao,
      numeroPedido,
      row.cliente_nome ?? '',
    ].join('::')

    const existente = agrupados.get(key)
    const quantidade = Number(row.quantidade ?? 0)

    if (existente) {
      existente.quantidade += quantidade
      existente.total_litros += quantidade * litros * unidades
      return
    }

    const alocacao = alocacoes.get(`${numeroPedido}::${produtoDescricao}`)

    agrupados.set(key, {
      data_pedido: row.data_criacao,
      pedido_situacao: row.pedido_situacao,
      data_prevista: row.data_prevista,
      categoria_produto: categoria,
      produto_descricao: produtoDescricao,
      numero_pedido: numeroPedido,
      cliente_nome: row.cliente_nome ?? 'Desconhecido',
      quantidade,
      litros_por_unidade: litros,
      unidades_por_embalagem: unidades,
      total_litros: quantidade * litros * unidades,
      alocado: Boolean(alocacao),
      ordem_id: alocacao?.ordem_id ?? null,
      ordem_status: alocacao?.ordem_status ?? null,
    })
  })

  return Array.from(agrupados.values())
    .filter((item) => mostrarAlocados || !item.alocado)
    .sort((a, b) => {
      const dataCompare = (a.data_prevista ?? '').localeCompare(b.data_prevista ?? '')
      if (dataCompare !== 0) return dataCompare
      const categoriaCompare = a.categoria_produto.localeCompare(b.categoria_produto)
      if (categoriaCompare !== 0) return categoriaCompare
      return a.produto_descricao.localeCompare(b.produto_descricao)
    })
}
