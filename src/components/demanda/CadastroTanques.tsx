'use client'
import { useState } from 'react'
import type { Tanque } from '@/types'

type Props = {
  tanques: Tanque[]
  onAtualizado: () => void
}

type EditState = { nome: string; volume_liters: string }

export function CadastroTanques({ tanques = [], onAtualizado }: Props) {
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoVolume, setNovoVolume] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ nome: '', volume_liters: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    const volume = parseFloat(novoVolume)
    if (isNaN(volume) || volume <= 0) {
      setErro('Capacidade deve ser um número maior que zero')
      setSalvando(false)
      return
    }
    const res = await fetch('/api/tanques', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novoNome, volume_liters: volume }),
    })
    const data = await res.json()
    setSalvando(false)
    if (!res.ok) { setErro(data.error ?? 'Erro ao criar tanque'); return }
    setNovoNome('')
    setNovoVolume('')
    setCriando(false)
    onAtualizado()
  }

  function iniciarEdicao(t: Tanque) {
    setEditandoId(t.id)
    setEditState({ nome: t.nome, volume_liters: String(t.volume_liters) })
    setErro('')
  }

  async function salvarEdicao(e: React.FormEvent, id: string) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    const volume = parseFloat(editState.volume_liters)
    if (isNaN(volume) || volume <= 0) {
      setErro('Capacidade deve ser um número maior que zero')
      setSalvando(false)
      return
    }
    const res = await fetch('/api/tanques', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nome: editState.nome, volume_liters: volume }),
    })
    const data = await res.json()
    setSalvando(false)
    if (!res.ok) { setErro(data.error ?? 'Erro ao salvar'); return }
    setEditandoId(null)
    onAtualizado()
  }

  async function toggleAtivo(t: Tanque) {
    setErro('')
    const res = await fetch('/api/tanques', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, ativo: !t.ativo }),
    })
    if (!res.ok) {
      const data = await res.json()
      setErro(data.error ?? 'Erro ao atualizar tanque')
      return
    }
    onAtualizado()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Tanques</h2>
        {!criando && (
          <button
            onClick={() => { setCriando(true); setErro('') }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            + Novo Tanque
          </button>
        )}
      </div>

      {criando && (
        <form onSubmit={criar} className="flex gap-2 mb-4 flex-wrap">
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome do tanque"
            required
            className="border border-gray-300 rounded px-3 py-2 text-sm flex-1 min-w-32"
          />
          <input
            value={novoVolume}
            onChange={(e) => setNovoVolume(e.target.value)}
            placeholder="Capacidade (L)"
            type="number"
            min="1"
            step="any"
            required
            className="border border-gray-300 rounded px-3 py-2 text-sm w-36"
          />
          <button
            type="submit"
            disabled={salvando}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {salvando ? 'Criando…' : 'Criar'}
          </button>
          <button
            type="button"
            onClick={() => { setCriando(false); setErro('') }}
            className="px-4 py-2 border rounded text-sm"
          >
            Cancelar
          </button>
        </form>
      )}

      {erro && <p className="text-red-600 text-sm mb-3">{erro}</p>}

      <div className="space-y-2">
        {tanques.length === 0 && (
          <p className="text-gray-500 text-sm py-4 text-center">Nenhum tanque cadastrado ainda.</p>
        )}
        {tanques.map((t) =>
          editandoId === t.id ? (
            <form
              key={t.id}
              onSubmit={(e) => salvarEdicao(e, t.id)}
              className="flex gap-2 items-center border border-blue-300 rounded px-3 py-2 flex-wrap"
            >
              <input
                value={editState.nome}
                onChange={(e) => setEditState((s) => ({ ...s, nome: e.target.value }))}
                required
                className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 min-w-28"
              />
              <input
                value={editState.volume_liters}
                onChange={(e) => setEditState((s) => ({ ...s, volume_liters: e.target.value }))}
                type="number"
                min="1"
                step="any"
                required
                className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
              />
              <button
                type="submit"
                disabled={salvando}
                className="text-sm px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
              >
                {salvando ? '…' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={() => setEditandoId(null)}
                className="text-sm px-3 py-1 border rounded"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <div
              key={t.id}
              className="flex items-center justify-between border border-gray-200 rounded px-4 py-3"
            >
              <div>
                <span className="font-medium">{t.nome}</span>
                <span className="ml-2 text-sm text-gray-500">{t.volume_liters.toLocaleString('pt-BR')} L</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => iniciarEdicao(t)}
                  className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
                >
                  Editar
                </button>
                <button
                  onClick={() => toggleAtivo(t)}
                  className={`text-sm px-3 py-1 rounded ${
                    t.ativo
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {t.ativo ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
