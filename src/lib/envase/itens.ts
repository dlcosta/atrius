import type { createClient } from '@/lib/supabase/server'
import type { ItemDemandaEnvase } from '@/types'
import { normalizarEmbalagem } from './normalizar-embalagem'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type PedidoItemView = {
  pedido_situacao: number | null
  numero_pedido: number | string | null
  data_criacao: string | null
  data_prevista: string | null
  cliente_nome: string | null
  produto_descricao: string | null
  quantidade: number | null
}

type OrdemPedidoRef = {
  ordem_id: string
  numero_pedido: string
  produto_descricao: string
}

type OrdemStatusRef = {
  id: string
  etapa: string
  planning_status: string | null
}

async function carregarAlocacoesEnvase(supabase: SupabaseServerClient) {
  const { data: alocacoes } = await supabase
    .from('ordens_pedidos_erp')
    .select('ordem_id, numero_pedido, produto_descricao')

  if (!alocacoes?.length) return new Map<string, { ordem_id: string; ordem_status: string | null }>()

  const ordemIds = Array.from(new Set((alocacoes as OrdemPedidoRef[]).map((a) => a.ordem_id)))
  const statusPorOrdem = new Map<string, { etapa: string; planning_status: string | null }>()

  if (ordemIds.length > 0) {
    const { data: ordens } = await supabase
      .from('ordens')
      .select('id, etapa, planning_status')
      .in('id', ordemIds)

    ;(ordens as OrdemStatusRef[] | null)?.forEach((o) => {
      statusPorOrdem.set(o.id, { etapa: o.etapa, planning_status: o.planning_status })
    })
  }

  const mapa = new Map<string, { ordem_id: string; ordem_status: string | null }>()
  ;(alocacoes as OrdemPedidoRef[]).forEach((a) => {
    const info = statusPorOrdem.get(a.ordem_id)
    if (!info) return
    if (info.etapa !== 'envase') return  // só alocações de envase
    if (info.planning_status === 'CANCELED') return
    mapa.set(`${a.numero_pedido}::${a.produto_descricao}`, {
      ordem_id: a.ordem_id,
      ordem_status: info.planning_status,
    })
  })

  return mapa
}

export async function buscarItensEnvase(
  supabase: SupabaseServerClient,
  mostrarAlocados = false
): Promise<ItemDemandaEnvase[]> {
  const { data, error } = await supabase
    .from('v_pedidos_erp_com_itens')
    .select('pedido_situacao, numero_pedido, data_criacao, data_prevista, cliente_nome, produto_descricao, quantidade')

  if (error) {
    throw new Error(`Erro ao buscar demanda de envase: ${error.message}`)
  }

  const alocacoes = await carregarAlocacoesEnvase(supabase)
  const agrupados = new Map<string, ItemDemandaEnvase>()

  ;((data ?? []) as PedidoItemView[]).forEach((row) => {
    const produtoDescricao = String(row.produto_descricao ?? '').trim()
    const numeroPedido = String(row.numero_pedido ?? '')
    if (!produtoDescricao || !numeroPedido) return

    const parsed = normalizarEmbalagem(produtoDescricao)

    // Só incluir itens que têm embalagem identificável (litros_por_unidade > 0)
    // e que não são itens de tanque (itens de tanque têm litros diretos, sem packaging)
    if (parsed.litros_por_unidade <= 0) return
    if (parsed.embalagem_volume_ml <= 0) return

    const key = [
      row.data_prevista ?? '',
      parsed.produto_base.toUpperCase().trim(),
      String(parsed.embalagem_volume_ml),
      numeroPedido,
    ].join('::')

    const quantidade = Number(row.quantidade ?? 0)
    const totalLitros = quantidade * parsed.unidades_por_cx * parsed.litros_por_unidade

    const existente = agrupados.get(key)
    if (existente) {
      existente.quantidade += quantidade
      existente.total_litros += totalLitros
      return
    }

    const alocacao = alocacoes.get(`${numeroPedido}::${produtoDescricao}`)

    agrupados.set(key, {
      data_prevista: row.data_prevista,
      produto_descricao: produtoDescricao,
      produto_base: parsed.produto_base,
      embalagem_label: parsed.embalagem_label,
      embalagem_volume_ml: parsed.embalagem_volume_ml,
      litros_por_unidade: parsed.litros_por_unidade,
      unidades_por_cx: parsed.unidades_por_cx,
      numero_pedido: numeroPedido,
      cliente_nome: row.cliente_nome ?? 'Desconhecido',
      quantidade,
      total_litros: totalLitros,
      confianca_embalagem: parsed.confianca,
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
      const baseCompare = a.produto_base.localeCompare(b.produto_base)
      if (baseCompare !== 0) return baseCompare
      return a.embalagem_volume_ml - b.embalagem_volume_ml
    })
}
