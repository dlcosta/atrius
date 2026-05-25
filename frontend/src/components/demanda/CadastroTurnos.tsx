'use client'
import { apiUrl } from '@/lib/api'
import { useState } from 'react'
import type { Turno } from '@/types'

type Props = {
  turnos: Turno[]
  onAtualizado: () => void
}

type EditState = { nome: string; hora_inicio: string; hora_fim: string }

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeToMinutes(time: string): number | null {
  const parts = time.split(':')
  if (parts.length < 2) return null
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

export function CadastroTurnos({ turnos = [], onAtualizado }: Props) {
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoInicio, setNovoInicio] = useState('')
  const [novoFim, setNovoFim] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ nome: '', hora_inicio: '', hora_fim: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    const inicio = timeToMinutes(novoInicio)
    if (inicio === null) { setErro('Hora de início inválida'); return }
    const fim = timeToMinutes(novoFim)
    if (fim === null) { setErro('Hora de fim inválida'); return }
    setSalvando(true)
    const res = await fetch(apiUrl('/api/turnos'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novoNome, hora_inicio: inicio, hora_fim: fim }),
    })
    const data = await res.json()
    setSalvando(false)
    if (!res.ok) { setErro(data.error ?? 'Erro ao criar turno'); return }
    setNovoNome('')
    setNovoInicio('')
    setNovoFim('')
    setCriando(false)
    onAtualizado()
  }

  function iniciarEdicao(t: Turno) {
    setEditandoId(t.id)
    setEditState({
      nome: t.nome,
      hora_inicio: minutesToTime(t.hora_inicio),
      hora_fim: minutesToTime(t.hora_fim),
    })
    setErro('')
  }

  async function salvarEdicao(e: React.FormEvent, id: string) {
    e.preventDefault()
    setErro('')
    const inicio = timeToMinutes(editState.hora_inicio)
    if (inicio === null) { setErro('Hora de início inválida'); return }
    const fim = timeToMinutes(editState.hora_fim)
    if (fim === null) { setErro('Hora de fim inválida'); return }
    setSalvando(true)
    const res = await fetch(apiUrl('/api/turnos'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nome: editState.nome, hora_inicio: inicio, hora_fim: fim }),
    })
    const data = await res.json()
    setSalvando(false)
    if (!res.ok) { setErro(data.error ?? 'Erro ao salvar'); return }
    setEditandoId(null)
    onAtualizado()
  }

  async function toggleAtivo(t: Turno) {
    setErro('')
    const res = await fetch(apiUrl('/api/turnos'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, ativo: !t.ativo }),
    })
    if (!res.ok) {
      const data = await res.json()
      setErro(data.error ?? 'Erro ao atualizar turno')
      return
    }
    onAtualizado()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Turnos de Produção</h2>
        {!criando && (
          <button
            onClick={() => { setCriando(true); setErro('') }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            + Novo Turno
          </button>
        )}
      </div>

      {criando && (
        <form onSubmit={criar} className="flex gap-2 mb-4 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Nome</label>
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex: Manhã"
              required
              className="border border-gray-300 rounded px-3 py-2 text-sm w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Início</label>
            <input
              value={novoInicio}
              onChange={(e) => setNovoInicio(e.target.value)}
              type="time"
              required
              className="border border-gray-300 rounded px-3 py-2 text-sm w-32"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Fim</label>
            <input
              value={novoFim}
              onChange={(e) => setNovoFim(e.target.value)}
              type="time"
              required
              className="border border-gray-300 rounded px-3 py-2 text-sm w-32"
            />
          </div>
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
        {turnos.length === 0 && (
          <p className="text-gray-500 text-sm py-4 text-center">Nenhum turno cadastrado ainda.</p>
        )}
        {turnos.map((t) =>
          editandoId === t.id ? (
            <form
              key={t.id}
              onSubmit={(e) => salvarEdicao(e, t.id)}
              className="flex gap-2 items-end border border-blue-300 rounded px-3 py-2 flex-wrap"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Nome</label>
                <input
                  value={editState.nome}
                  onChange={(e) => setEditState((s) => ({ ...s, nome: e.target.value }))}
                  required
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Início</label>
                <input
                  value={editState.hora_inicio}
                  onChange={(e) => setEditState((s) => ({ ...s, hora_inicio: e.target.value }))}
                  type="time"
                  required
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Fim</label>
                <input
                  value={editState.hora_fim}
                  onChange={(e) => setEditState((s) => ({ ...s, hora_fim: e.target.value }))}
                  type="time"
                  required
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
                />
              </div>
              <button
                type="submit"
                disabled={salvando}
                className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
              >
                {salvando ? '…' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={() => setEditandoId(null)}
                className="text-sm px-3 py-1.5 border rounded"
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
                <span className="ml-2 text-sm text-gray-500">
                  {minutesToTime(t.hora_inicio)} – {minutesToTime(t.hora_fim)}
                </span>
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
