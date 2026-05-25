'use client'
import { useState } from 'react'
import type { Tanque, Turno } from '@/types'
import { CadastroTanques } from './CadastroTanques'
import { CadastroTurnos } from './CadastroTurnos'

type Tab = 'tanques' | 'turnos'

type Props = {
  tanques: Tanque[]
  turnos: Turno[]
  onTanquesAtualizado: () => void
  onTurnosAtualizado: () => void
}

export function CadastrosContainer({ tanques, turnos, onTanquesAtualizado, onTurnosAtualizado }: Props) {
  const [tab, setTab] = useState<Tab>('tanques')

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab('tanques')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'tanques'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Tanques
        </button>
        <button
          onClick={() => setTab('turnos')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'turnos'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Turnos
        </button>
      </div>

      {tab === 'tanques' && (
        <CadastroTanques tanques={tanques} onAtualizado={onTanquesAtualizado} />
      )}
      {tab === 'turnos' && (
        <CadastroTurnos turnos={turnos} onAtualizado={onTurnosAtualizado} />
      )}
    </div>
  )
}
