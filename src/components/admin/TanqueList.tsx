'use client'

import { useState } from 'react'
import type { Tanque } from '@/types'

type Props = {
  tanques: Tanque[]
  onAtualizado: () => void
}

type EditState = {
  nome: string
  volumeLiters: string
}

export function TanqueList({ tanques, onAtualizado }: Props) {
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoVolumeLiters, setNovoVolumeLiters] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ nome: '', volumeLiters: '' })
  const [salvando, setSalvando] = useState(false)

  function parseVolume(valor: string): number | null {
    const parsed = Number(valor.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault()

    const volume = parseVolume(novoVolumeLiters)
    if (!volume) {
      alert('Informe uma capacidade válida em litros.')
      return
    }

    setSalvando(true)
    const res = await fetch('/api/tanques', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novoNome, volume_liters: volume }),
    })
    setSalvando(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao criar tanque')
      return
    }

    setNovoNome('')
    setNovoVolumeLiters('')
    setCriando(false)
    onAtualizado()
  }

  function iniciarEdicao(tanque: Tanque) {
    setEditandoId(tanque.id)
    setEditState({
      nome: tanque.nome,
      volumeLiters: String(tanque.volume_liters),
    })
  }

  async function salvarEdicao(e: React.FormEvent, tanqueId: string) {
    e.preventDefault()

    const volume = parseVolume(editState.volumeLiters)
    if (!volume) {
      alert('Informe uma capacidade válida em litros.')
      return
    }

    setSalvando(true)
    const res = await fetch('/api/tanques', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tanqueId,
        nome: editState.nome,
        volume_liters: volume,
      }),
    })
    setSalvando(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao atualizar tanque')
      return
    }

    setEditandoId(null)
    onAtualizado()
  }

  async function toggleAtivo(tanque: Tanque) {
    const res = await fetch('/api/tanques', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tanque.id, ativo: !tanque.ativo }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao atualizar tanque')
      return
    }

    onAtualizado()
  }

  async function excluir(tanque: Tanque) {
    if (!confirm(`Excluir "${tanque.nome}"?`)) return

    const res = await fetch('/api/tanques', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tanque.id }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao excluir tanque')
      return
    }

    onAtualizado()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Tanques</h3>
          <p className="text-sm text-slate-500">
            Cadastro manual dos tanques usados no preparo e no vínculo com ordens de envase.
          </p>
        </div>

        {!criando && (
          <button
            onClick={() => setCriando(true)}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            + Novo tanque
          </button>
        )}
      </div>

      {criando && (
        <form onSubmit={criar} className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto_auto]">
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex.: Tanque 5.000 L"
              required
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            />
            <input
              value={novoVolumeLiters}
              onChange={(e) => setNovoVolumeLiters(e.target.value)}
              placeholder="Capacidade (L)"
              inputMode="decimal"
              required
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            />
            <button
              type="submit"
              disabled={salvando}
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              {salvando ? 'Criando...' : 'Criar'}
            </button>
            <button
              type="button"
              onClick={() => setCriando(false)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">Capacidade</th>
              <th className="px-4 py-3 text-left">Criado em</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tanques.map((tanque) =>
              editandoId === tanque.id ? (
                <tr key={tanque.id} className="bg-cyan-50/70">
                  <td colSpan={4} className="px-4 py-4">
                    <form onSubmit={(e) => salvarEdicao(e, tanque.id)} className="grid gap-3 md:grid-cols-[1fr_180px_auto_auto]">
                      <input
                        value={editState.nome}
                        onChange={(e) => setEditState((atual) => ({ ...atual, nome: e.target.value }))}
                        required
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                      />
                      <input
                        value={editState.volumeLiters}
                        onChange={(e) => setEditState((atual) => ({ ...atual, volumeLiters: e.target.value }))}
                        inputMode="decimal"
                        required
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                      />
                      <button
                        type="submit"
                        disabled={salvando}
                        className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                      >
                        {salvando ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoId(null)}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={tanque.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{tanque.nome}</td>
                  <td className="px-4 py-3 text-slate-500">{tanque.volume_liters.toLocaleString('pt-BR')} L</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(tanque.criado_em).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => iniciarEdicao(tanque)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleAtivo(tanque)}
                        className={`rounded-full px-3 py-1 text-sm ${
                          tanque.ativo
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {tanque.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                      <button
                        onClick={() => excluir(tanque)}
                        className="rounded-xl bg-red-50 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}

            {tanques.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Nenhum tanque cadastrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
