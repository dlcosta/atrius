'use client'

import { useState } from 'react'
import { ClipboardList, Settings, History, ListOrdered, ClipboardCheck } from 'lucide-react'
import type { ItemDemanda, Ordem, Tanque, Turno } from '@/types'
import { DemandaContainer } from './DemandaContainer'
import { CadastrosContainer } from './CadastrosContainer'
import { HistoricoContainer } from './HistoricoContainer'
import { ListaProducaoContainer } from './ListaProducaoContainer'
import { ConferenciaPedidosContainer } from './ConferenciaPedidosContainer'

type Props = {
  itensIniciais: ItemDemanda[]
  ordensIniciais: Ordem[]
  tanques: Tanque[]
  turnosIniciais: Turno[]
}

type ViewMode = 'demanda' | 'conferencia' | 'lista' | 'historico' | 'cadastros'

export function DemandaProducaoContainer({ itensIniciais, ordensIniciais, tanques: tanquesIniciais, turnosIniciais }: Props) {
  const [view, setView] = useState<ViewMode>('demanda')
  const [ordens, setOrdens] = useState<Ordem[]>(ordensIniciais)
  const [tanques, setTanques] = useState<Tanque[]>(tanquesIniciais)
  const [turnos, setTurnos] = useState<Turno[]>(turnosIniciais)

  const handleOrdemCriada = () => {
    fetch('/api/demanda/ordens')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setOrdens(data)
      })
      .catch(console.error)
  }

  const handleTanquesAtualizado = () => {
    fetch('/api/tanques')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setTanques(data)
      })
      .catch(console.error)
  }

  const handleTurnosAtualizado = () => {
    fetch('/api/turnos')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setTurnos(data)
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
            onClick={() => setView('conferencia')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              view === 'conferencia'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ClipboardCheck size={18} />
            Conferência de Pedidos
          </button>
          <button
            onClick={() => setView('lista')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              view === 'lista'
                ? 'bg-blue-600 text-white shadow-md'
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
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <History size={18} />
            Histórico
          </button>
          <button
            onClick={() => setView('cadastros')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              view === 'cadastros'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Settings size={18} />
            Cadastros
          </button>
        </div>

        {/* Conteúdo */}
        {view === 'demanda' && (
          <DemandaContainer
            itensIniciais={itensIniciais}
            ordensIniciais={ordens}
            tanques={tanques}
            turnos={turnos}
          />
        )}
        {view === 'conferencia' && (
          <ConferenciaPedidosContainer />
        )}
        {view === 'lista' && (
          <ListaProducaoContainer />
        )}
        {view === 'historico' && (
          <HistoricoContainer />
        )}
        {view === 'cadastros' && (
          <div className="bg-white rounded-lg shadow p-6">
            <CadastrosContainer
              tanques={tanques}
              turnos={turnos}
              onTanquesAtualizado={handleTanquesAtualizado}
              onTurnosAtualizado={handleTurnosAtualizado}
            />
          </div>
        )}
      </div>
    </div>
  )
}
