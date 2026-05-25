'use client'

import type { ItemDemanda } from '@/types'

type Props = {
  item: ItemDemanda
  selecionado: boolean
  bloqueado: boolean
  onChange: (item: ItemDemanda, checked: boolean) => void
}

export function ItemPedidoRow({ item, selecionado, bloqueado, onChange }: Props) {
  const desabilitado = bloqueado && !selecionado

  return (
    <label
      className={`flex items-start gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors ${
        item.alocado
          ? 'opacity-50 bg-slate-50'
          : selecionado
          ? 'bg-blue-50 border border-blue-200'
          : desabilitado
          ? 'opacity-40 cursor-not-allowed bg-slate-50'
          : 'hover:bg-slate-50 border border-transparent'
      }`}
      title={desabilitado ? 'Tanque cheio — crie esta ordem antes de continuar' : undefined}
    >
      <input
        type="checkbox"
        checked={selecionado}
        disabled={desabilitado || !!item.alocado}
        onChange={(e) => onChange(item, e.target.checked)}
        className="mt-0.5 accent-blue-600"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800 truncate">
            Pedido {item.numero_pedido} — {item.cliente_nome}
          </span>
          <span className="text-sm font-bold text-slate-600 tabular-nums shrink-0">
            {item.total_litros.toLocaleString('pt-BR')}L
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">{item.produto_descricao}</p>
        {item.alocado && (
          <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            {item.ordem_status ?? 'alocado'}
          </span>
        )}
      </div>
    </label>
  )
}
