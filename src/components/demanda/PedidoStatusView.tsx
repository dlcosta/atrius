'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Package } from 'lucide-react'
import type { ItemDemanda } from '@/types'

type Props = {
  itens: ItemDemanda[]
}

type PedidoAgrupado = {
  numero_pedido: string
  cliente_nome: string
  itens: ItemDemanda[]
  totalLitros: number
  alocadoLitros: number
  pendenteLitros: number
  percentualAlocado: number
}

export function PedidoStatusView({ itens }: Props) {
  const [expandido, setExpandido] = useState<string | null>(null)

  const pedidosAgrupados = useMemo(() => {
    const porPedido = new Map<string, ItemDemanda[]>()

    for (const item of itens) {
      if (!porPedido.has(item.numero_pedido)) porPedido.set(item.numero_pedido, [])
      porPedido.get(item.numero_pedido)!.push(item)
    }

    return Array.from(porPedido.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([numero_pedido, itensPedido]) => {
        const totalLitros = itensPedido.reduce((acc, i) => acc + i.total_litros, 0)
        const alocadoLitros = itensPedido
          .filter((i) => i.alocado)
          .reduce((acc, i) => acc + i.total_litros, 0)
        const pendenteLitros = totalLitros - alocadoLitros

        return {
          numero_pedido,
          cliente_nome: itensPedido[0]?.cliente_nome ?? 'Desconhecido',
          itens: itensPedido,
          totalLitros,
          alocadoLitros,
          pendenteLitros,
          percentualAlocado: totalLitros > 0 ? (alocadoLitros / totalLitros) * 100 : 0,
        }
      })
  }, [itens])

  if (pedidosAgrupados.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Package size={40} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">Nenhum pedido encontrado</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {pedidosAgrupados.map((pedido) => (
        <div key={pedido.numero_pedido} className="border border-slate-200 rounded-lg overflow-hidden">
          {/* Header */}
          <button
            onClick={() =>
              setExpandido((prev) => (prev === pedido.numero_pedido ? null : pedido.numero_pedido))
            }
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {expandido === pedido.numero_pedido ? (
                <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
              ) : (
                <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">Pedido {pedido.numero_pedido}</div>
                <div className="text-xs text-slate-600 truncate">{pedido.cliente_nome}</div>
              </div>
            </div>

            {/* Progress bar compacta */}
            <div className="flex items-center gap-3 ml-4 flex-shrink-0">
              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    pedido.percentualAlocado === 100
                      ? 'bg-green-500'
                      : pedido.percentualAlocado > 0
                        ? 'bg-blue-500'
                        : 'bg-slate-300'
                  }`}
                  style={{ width: `${pedido.percentualAlocado}%` }}
                />
              </div>
              <div className="text-right text-xs font-semibold text-slate-700 w-16">
                {pedido.percentualAlocado.toFixed(0)}%
              </div>
            </div>
          </button>

          {/* Conteúdo expandido */}
          {expandido === pedido.numero_pedido && (
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
              {/* Resumo */}
              <div className="grid grid-cols-3 gap-3 bg-white rounded-lg p-3">
                <div>
                  <div className="text-xs text-slate-600 uppercase font-semibold">Total</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {pedido.totalLitros.toLocaleString('pt-BR')}L
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-600 uppercase font-semibold">Alocado</div>
                  <div className="text-sm font-bold text-green-600 mt-0.5">
                    {pedido.alocadoLitros.toLocaleString('pt-BR')}L
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-600 uppercase font-semibold">Pendente</div>
                  <div
                    className={`text-sm font-bold mt-0.5 ${
                      pedido.pendenteLitros === 0 ? 'text-green-600' : 'text-orange-600'
                    }`}
                  >
                    {pedido.pendenteLitros.toLocaleString('pt-BR')}L
                  </div>
                </div>
              </div>

              {/* Itens do pedido */}
              <div className="space-y-2">
                {pedido.itens
                  .sort((a, b) => {
                    const aData = a.data_prevista?.slice(0, 10) ?? ''
                    const bData = b.data_prevista?.slice(0, 10) ?? ''
                    return aData.localeCompare(bData)
                  })
                  .map((item) => (
                    <div
                      key={`${item.numero_pedido}::${item.produto_descricao}`}
                      className="bg-white border border-slate-200 rounded p-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {item.produto_descricao}
                          </div>
                          <div className="text-slate-600 mt-1">
                            Previsão:{' '}
                            <span className="font-semibold">
                              {item.data_prevista?.slice(0, 10) ?? 'N/A'}
                            </span>
                          </div>
                          <div className="text-slate-600">
                            Quantidade: <span className="font-semibold">{item.quantidade}</span> •{' '}
                            <span className="font-semibold">{item.total_litros.toLocaleString('pt-BR')}L</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <div
                            className={`px-2 py-1 rounded font-semibold text-white whitespace-nowrap ${
                              item.alocado ? 'bg-green-500' : 'bg-orange-500'
                            }`}
                          >
                            {item.alocado ? 'Alocado' : 'Pendente'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
