'use client'
import { apiUrl } from '@/lib/api'

import { useState } from 'react'
import type { Maquina } from '@/types'

type Props = {
  maquinas: Maquina[]
  onAtualizado: () => void
}

export function MaquinaList({ maquinas, onAtualizado }: Props) {
  const [novaNome, setNovaNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEdicao, setNomeEdicao] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function criar(e: React.FormEvent) {
    e.preventDefault()

    const res = await fetch(apiUrl('/api/maquinas'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novaNome }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao criar máquina')
      return
    }

    setNovaNome('')
    setCriando(false)
    onAtualizado()
  }

  function iniciarEdicao(maquina: Maquina) {
    setEditandoId(maquina.id)
    setNomeEdicao(maquina.nome)
  }

  async function salvarEdicao(e: React.FormEvent, maquinaId: string) {
    e.preventDefault()
    setSalvando(true)

    const res = await fetch(apiUrl('/api/maquinas'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: maquinaId, nome: nomeEdicao }),
    })

    setSalvando(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao atualizar máquina')
      return
    }

    setEditandoId(null)
    setNomeEdicao('')
    onAtualizado()
  }

  async function toggleAtiva(maquina: Maquina) {
    const res = await fetch(apiUrl('/api/maquinas'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: maquina.id, ativa: !maquina.ativa }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao atualizar máquina')
      return
    }

    onAtualizado()
  }

  async function excluir(maquina: Maquina) {
    if (!confirm(`Excluir "${maquina.nome}"?`)) return

    const res = await fetch(apiUrl('/api/maquinas'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: maquina.id }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao excluir máquina')
      return
    }

    onAtualizado()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Máquinas</h3>
          <p className="text-sm text-slate-500">
            Cadastre e mantenha os recursos usados no envase, no planner e nas métricas operacionais.
          </p>
        </div>

        {!criando && (
          <button
            onClick={() => setCriando(true)}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            + Nova máquina
          </button>
        )}
      </div>

      {criando && (
        <form onSubmit={criar} className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <input
              value={novaNome}
              onChange={(e) => setNovaNome(e.target.value)}
              placeholder="Ex.: MAQ 4"
              required
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            />
            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Criar
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
              <th className="px-4 py-3 text-left">Criada em</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {maquinas.map((maquina) =>
              editandoId === maquina.id ? (
                <tr key={maquina.id} className="bg-blue-50/70">
                  <td colSpan={3} className="px-4 py-4">
                    <form onSubmit={(e) => salvarEdicao(e, maquina.id)} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                      <input
                        value={nomeEdicao}
                        onChange={(e) => setNomeEdicao(e.target.value)}
                        required
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                      />
                      <button
                        type="submit"
                        disabled={salvando}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {salvando ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditandoId(null)
                          setNomeEdicao('')
                        }}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={maquina.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{maquina.nome}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(maquina.criado_em).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => iniciarEdicao(maquina)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleAtiva(maquina)}
                        className={`rounded-full px-3 py-1 text-sm ${
                          maquina.ativa
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {maquina.ativa ? 'Ativa' : 'Inativa'}
                      </button>
                      <button
                        onClick={() => excluir(maquina)}
                        className="rounded-xl bg-red-50 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}

            {maquinas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  Nenhuma máquina cadastrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
