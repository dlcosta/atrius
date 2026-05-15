'use client'

import { useState } from 'react'
import { Calendar, Package } from 'lucide-react'
import type { ItemDemanda, Ordem, Tanque } from '@/types'
import { DemandaCalendar } from './DemandaCalendar'
import { PedidoStatusView } from './PedidoStatusView'

type Props = {
  itensIniciais: ItemDemanda[]
  ordensIniciais: Ordem[]
  tanques: Tanque[]
}

type ViewMode = 'calendario' | 'pedidos'

export function DemandaContainer({ itensIniciais, ordensIniciais, tanques }: Props) {
  const [view, setView] = useState<ViewMode>('calendario')
  const [ordens, setOrdens] = useState<Ordem[]>(ordensIniciais)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 max-w-6xl mx-auto">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView('calendario')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              view === 'calendario'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Calendar size={18} />
            Por Data
          </button>
          <button
            onClick={() => setView('pedidos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              view === 'pedidos'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Package size={18} />
            Por Pedido
          </button>
        </div>

        {/* Conteúdo */}
        {view === 'calendario' && (
          <DemandaCalendar
            itensIniciais={itensIniciais}
            ordensAgendadas={ordens}
            tanques={tanques}
          />
        )}
        {view === 'pedidos' && <PedidoStatusView itens={itensIniciais} />}
      </div>
    </div>
  )
}
