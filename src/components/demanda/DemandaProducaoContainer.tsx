'use client'

import { useState } from 'react'
import { ClipboardList, Droplet } from 'lucide-react'
import type { ItemDemanda, Ordem, Tanque } from '@/types'
import { DemandaContainer } from './DemandaContainer'
import { ProducaoCalendar } from '../producao/ProducaoCalendar'

type Props = {
  itensIniciais: ItemDemanda[]
  ordensIniciais: Ordem[]
  tanques: Tanque[]
}

type ViewMode = 'demanda' | 'producao'

export function DemandaProducaoContainer({ itensIniciais, ordensIniciais, tanques }: Props) {
  const [view, setView] = useState<ViewMode>('demanda')
  const [ordens, setOrdens] = useState<Ordem[]>(ordensIniciais)

  const handleOrdemCriada = () => {
    // Recarregar ordens após criar nova
    fetch('/api/demanda/ordens')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setOrdens(data)
      })
      .catch(console.error)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView('demanda')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              view === 'demanda'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ClipboardList size={18} />
            Criar Demanda
          </button>
          <button
            onClick={() => setView('producao')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              view === 'producao'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Droplet size={18} />
            Agendar Produção
          </button>
        </div>

        {/* Conteúdo */}
        {view === 'demanda' && (
          <DemandaContainer
            itensIniciais={itensIniciais}
            ordensIniciais={ordens}
            tanques={tanques}
          />
        )}
        {view === 'producao' && (
          <ProducaoCalendar
            ordens={ordens}
            tanques={tanques}
          />
        )}
      </div>
    </div>
  )
}
