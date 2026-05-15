'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ItemDemanda, Tanque } from '@/types'
import { TanqueProgressBar } from './TanqueProgressBar'
import { ItemPedidoRow } from './ItemPedidoRow'

type Props = {
  categoria: string
  itens: ItemDemanda[]
  tanques: Tanque[]
  expandido: boolean
  onToggle: () => void
  onOrdemCriada: () => void
}

export function CategoriaAccordion({
  categoria,
  itens,
  tanques,
  expandido,
  onToggle,
  onOrdemCriada,
}: Props) {
  const [tanqueId, setTanqueId] = useState<string>(tanques[0]?.id ?? '')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [nomeOrdem, setNomeOrdem] = useState<string>('')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const tanqueSelecionado = tanques.find((t) => t.id === tanqueId)
  const capacidade = tanqueSelecionado?.volume_liters ?? 0

  const litrosSelecionados = itens
    .filter((item) => selecionados.has(itemKey(item)))
    .reduce((acc, item) => acc + item.total_litros, 0)

  const cheio = capacidade > 0 && litrosSelecionados >= capacidade

  function itemKey(item: ItemDemanda) {
    return `${item.numero_pedido}::${item.produto_descricao}`
  }

  function handleChange(item: ItemDemanda, checked: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (checked) next.add(itemKey(item))
      else next.delete(itemKey(item))
      return next
    })
  }

  async function handleCriarOrdem() {
    if (selecionados.size === 0 || !tanqueId || !nomeOrdem.trim()) return
    const itensSelecionados = itens.filter((item) => selecionados.has(itemKey(item)))
    const dataPrevista = itensSelecionados
      .map((i) => i.data_prevista?.slice(0, 10) ?? '')
      .filter(Boolean)
      .sort()[0] ?? ''

    setCriando(true)
    setErro(null)

    try {
      const res = await fetch('/api/demanda/ordens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria_produto: categoria,
          nome_ordem: nomeOrdem.trim(),
          data_prevista: dataPrevista,
          tank_id: tanqueId,
          total_litros: litrosSelecionados,
          itens: itensSelecionados.map((item) => ({
            numero_pedido: item.numero_pedido,
            produto_descricao: item.produto_descricao,
            quantidade: item.quantidade,
            total_litros: item.total_litros,
          })),
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        setErro(json.error ?? 'Erro ao criar ordem')
        return
      }

      setSelecionados(new Set())
      setNomeOrdem('')
      onOrdemCriada()
    } catch {
      setErro('Erro de rede ao criar ordem')
    } finally {
      setCriando(false)
    }
  }

  const totalPendente = itens
    .filter((item) => !item.alocado)
    .reduce((acc, item) => acc + item.total_litros, 0)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {expandido ? (
            <ChevronDown size={16} className="text-slate-400" />
          ) : (
            <ChevronRight size={16} className="text-slate-400" />
          )}
          <span className="text-sm font-semibold text-slate-800">{categoria}</span>
        </div>
        <span className="text-xs text-slate-500 font-medium">
          {totalPendente.toLocaleString('pt-BR')}L pendentes
        </span>
      </button>

      {/* Corpo expandido */}
      {expandido && (
        <div className="border-t border-slate-200 bg-white">
          {/* Controles de tanque e progresso */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 space-y-2">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-600 shrink-0">Tanque:</label>
              <select
                value={tanqueId}
                onChange={(e) => {
                  setTanqueId(e.target.value)
                  setSelecionados(new Set())
                }}
                className="text-sm border border-slate-300 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {tanques.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.volume_liters.toLocaleString('pt-BR')}L)
                  </option>
                ))}
              </select>
            </div>
            <TanqueProgressBar
              litrosSelecionados={litrosSelecionados}
              capacidadeTanque={capacidade}
            />
          </div>

          {/* Lista de itens agrupada por data → pedido */}
          <div className="px-2 py-1">
            {(() => {
              const porData = new Map<string, Map<string, ItemDemanda[]>>()
              for (const item of itens) {
                const dataKey = item.data_prevista?.slice(0, 10) ?? 'sem-data'
                const pedidoKey = item.numero_pedido
                if (!porData.has(dataKey)) porData.set(dataKey, new Map())
                const porPedido = porData.get(dataKey)!
                if (!porPedido.has(pedidoKey)) porPedido.set(pedidoKey, [])
                porPedido.get(pedidoKey)!.push(item)
              }
              return Array.from(porData.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dataKey, porPedido]) => (
                  <div key={dataKey} className="mb-3">
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-100 rounded text-xs font-semibold text-slate-600 uppercase">
                      {(() => {
                        try {
                          return format(parseISO(dataKey), "dd 'de' MMMM", { locale: ptBR })
                        } catch {
                          return dataKey
                        }
                      })()}
                    </div>
                    <div className="mt-1 space-y-2">
                      {Array.from(porPedido.entries())
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([pedidoKey, itensPedido]) => (
                          <div key={pedidoKey} className="ml-2 border-l-2 border-slate-200 pl-2">
                            <div className="text-xs font-semibold text-slate-700 py-1">
                              Pedido {pedidoKey}
                            </div>
                            <div className="divide-y divide-slate-100">
                              {itensPedido.map((item) => (
                                <ItemPedidoRow
                                  key={itemKey(item)}
                                  item={item}
                                  selecionado={selecionados.has(itemKey(item))}
                                  bloqueado={cheio}
                                  onChange={handleChange}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))
            })()}
          </div>

          {/* Erro */}
          {erro && (
            <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {erro}
            </div>
          )}

          {/* Nome da ordem + Botão criar */}
          {selecionados.size > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 space-y-3">
              <input
                type="text"
                placeholder="Digite um nome para a ordem..."
                value={nomeOrdem}
                onChange={(e) => setNomeOrdem(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCriarOrdem}
                disabled={criando || !nomeOrdem.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Plus size={16} />
                {criando
                  ? 'Criando...'
                  : `Criar Ordem de Produção — ${litrosSelecionados.toLocaleString('pt-BR')}L`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
