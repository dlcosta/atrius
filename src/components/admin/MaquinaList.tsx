'use client'
import { useState } from 'react'
import type { Maquina } from '@/types'

type Props = {
  maquinas: Maquina[]
  onAtualizado: () => void
}

export function MaquinaList({ maquinas, onAtualizado }: Props) {
  const [novaNome, setNovaNome] = useState('')
  const [criando, setCriando] = useState(false)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novaNome }),
    })
    setNovaNome('')
    setCriando(false)
    onAtualizado()
  }

  async function toggleAtiva(m: Maquina) {
    await fetch('/api/maquinas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, ativa: !m.ativa }),
    })
    onAtualizado()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Máquinas</h2>
        {!criando && (
          <button
            onClick={() => setCriando(true)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            + Nova Máquina
          </button>
        )}
      </div>

      {criando && (
        <form onSubmit={criar} className="flex gap-2 mb-4">
          <input
            value={novaNome}
            onChange={(e) => setNovaNome(e.target.value)}
            placeholder="Ex: MAQ 4"
            required
            className="border border-gray-300 rounded px-3 py-2 text-sm flex-1"
          />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Criar</button>
          <button type="button" onClick={() => setCriando(false)} className="px-4 py-2 border rounded text-sm">Cancelar</button>
        </form>
      )}

      <div className="space-y-2">
        {maquinas.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between border border-gray-200 rounded px-4 py-3"
          >
            <span className="font-medium">{m.nome}</span>
            <button
              onClick={() => toggleAtiva(m)}
              className={`text-sm px-3 py-1 rounded ${
                m.ativa
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {m.ativa ? 'Ativa' : 'Inativa'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
