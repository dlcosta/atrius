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

export function TurnoList({ turnos, onAtualizado }: Props) {
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
    setNovoNome(''); setNovoInicio(''); setNovoFim('')
    setCriando(false)
    onAtualizado()
  }

  function iniciarEdicao(t: Turno) {
    setEditandoId(t.id)
    setEditState({ nome: t.nome, hora_inicio: minutesToTime(t.hora_inicio), hora_fim: minutesToTime(t.hora_fim) })
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
    if (!res.ok) { setErro(data.error ?? 'Erro ao salvar turno'); return }
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

  async function excluir(t: Turno) {
    if (!confirm(`Excluir o turno "${t.nome}"?`)) return
    const res = await fetch(apiUrl('/api/turnos'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id }),
    })
    if (!res.ok) {
      const data = await res.json()
      setErro(data.error ?? 'Erro ao excluir turno')
      return
    }
    onAtualizado()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Turnos de Produção</h3>
          <p className="text-sm text-slate-500">
            Defina os turnos que aparecem no calendário e no painel operacional.
          </p>
        </div>
        {!criando && (
          <button
            onClick={() => { setCriando(true); setErro('') }}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            + Novo turno
          </button>
        )}
      </div>

      {criando && (
        <form onSubmit={criar} className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nome do turno (ex: Manhã)"
              required
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <input
              value={novoInicio}
              onChange={(e) => setNovoInicio(e.target.value)}
              type="time"
              required
              title="Início"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <input
              value={novoFim}
              onChange={(e) => setNovoFim(e.target.value)}
              type="time"
              required
              title="Fim"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <button type="submit" disabled={salvando} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
              {salvando ? 'Criando…' : 'Criar'}
            </button>
            <button type="button" onClick={() => { setCriando(false); setErro('') }} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
          </div>
          {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
        </form>
      )}

      {!criando && erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">Horário</th>
              <th className="px-4 py-3 text-left">Duração</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {turnos.map((t) =>
              editandoId === t.id ? (
                <tr key={t.id} className="bg-violet-50/70">
                  <td colSpan={4} className="px-4 py-4">
                    <form onSubmit={(e) => salvarEdicao(e, t.id)} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
                      <input
                        value={editState.nome}
                        onChange={(e) => setEditState((s) => ({ ...s, nome: e.target.value }))}
                        required
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        value={editState.hora_inicio}
                        onChange={(e) => setEditState((s) => ({ ...s, hora_inicio: e.target.value }))}
                        type="time"
                        required
                        title="Início"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        value={editState.hora_fim}
                        onChange={(e) => setEditState((s) => ({ ...s, hora_fim: e.target.value }))}
                        type="time"
                        required
                        title="Fim"
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <button type="submit" disabled={salvando} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                        {salvando ? '…' : 'Salvar'}
                      </button>
                      <button type="button" onClick={() => setEditandoId(null)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Cancelar
                      </button>
                    </form>
                    {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{t.nome}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {minutesToTime(t.hora_inicio)} – {minutesToTime(t.hora_fim)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {(() => {
                      const dur = t.hora_fim - t.hora_inicio
                      if (dur <= 0) return '—'
                      const h = Math.floor(dur / 60)
                      const m = dur % 60
                      return h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => iniciarEdicao(t)} className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        Editar
                      </button>
                      <button
                        onClick={() => toggleAtivo(t)}
                        className={`rounded-full px-3 py-1 text-sm ${t.ativo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {t.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                      <button onClick={() => excluir(t)} className="rounded-xl bg-red-50 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100">
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {turnos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Nenhum turno cadastrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
