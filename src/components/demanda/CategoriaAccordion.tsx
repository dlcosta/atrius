'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
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
    if (selecionados.size === 0 || !tanqueId) return
    const itensSelecionados = itens.filter((item) => selecionados.has(itemKey(item)))
    const dataPrevista = itensSelecionados[0]?.data_prevista ?? ''

    setCriando(true)
    setErro(null)

    try {
      const res = await fetch('/api/demanda/ordens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria_produto: categoria,
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

          {/* Lista de itens */}
          <div className="divide-y divide-slate-100 px-2 py-1">
            {itens.map((item) => (
              <ItemPedidoRow
                key={itemKey(item)}
                item={item}
                selecionado={selecionados.has(itemKey(item))}
                bloqueado={cheio}
                onChange={handleChange}
              />
            ))}
          </div>

          {/* Erro */}
          {erro && (
            <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {erro}
            </div>
          )}

          {/* Botão criar */}
          {selecionados.size > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleCriarOrdem}
                disabled={criando}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
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
