'use client'

import { useState } from 'react'
import { FlaskConical, ListOrdered, History } from 'lucide-react'
import type { ItemDemandaEnvase, Maquina, Ordem } from '@/types'
import { EnvaseContainer } from './EnvaseContainer'
import { ListaProducaoContainer } from '../demanda/ListaProducaoContainer'
import { HistoricoContainer } from '../demanda/HistoricoContainer'

type Props = {
  itensIniciais: ItemDemandaEnvase[]
  ordensIniciais: Ordem[]
  maquinas: Maquina[]
  ordensTanqueIniciais: Ordem[]
}

type ViewMode = 'envase' | 'lista' | 'historico'

export function EnvaseProducaoContainer({
  itensIniciais,
  ordensIniciais,
  maquinas,
  ordensTanqueIniciais,
}: Props) {
  const [view, setView] = useState<ViewMode>('envase')

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView('envase')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              view === 'envase'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FlaskConical size={18} />
            Planejamento de Envase
          </button>
          <button
            onClick={() => setView('lista')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              view === 'lista'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ListOrdered size={18} />
            Lista de Produção
          </button>
          <button
            onClick={() => setView('historico')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              view === 'historico'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <History size={18} />
            Histórico
          </button>
        </div>

        {view === 'envase' && (
          <EnvaseContainer
            itensIniciais={itensIniciais}
            ordensIniciais={ordensIniciais}
            maquinas={maquinas}
            ordensTanqueIniciais={ordensTanqueIniciais}
          />
        )}
        {view === 'lista' && <ListaProducaoContainer etapa="envase" />}
        {view === 'historico' && <HistoricoContainer etapa="envase" />}
      </div>
    </div>
  )
}
