'use client'
import { apiUrl } from '@/lib/api'

import { useState } from 'react'
import type { Operador } from '@/types'

type Props = {
  operadores: Operador[]
  onAtualizado: () => void
}

export function OperadorList({ operadores, onAtualizado }: Props) {
  const [novoNome, setNovoNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEdicao, setNomeEdicao] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(apiUrl('/api/operadores'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novoNome }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao criar operador')
      return
    }

    setNovoNome('')
    setCriando(false)
    onAtualizado()
  }

  function iniciarEdicao(operador: Operador) {
    setEditandoId(operador.id)
    setNomeEdicao(operador.nome)
  }

  async function salvarEdicao(e: React.FormEvent, operadorId: string) {
    e.preventDefault()
    setSalvando(true)

    const res = await fetch(apiUrl('/api/operadores'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: operadorId, nome: nomeEdicao }),
    })

    setSalvando(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao atualizar operador')
      return
    }

    setEditandoId(null)
    setNomeEdicao('')
    onAtualizado()
  }

  async function toggleAtivo(operador: Operador) {
    const res = await fetch(apiUrl('/api/operadores'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: operador.id, ativo: !operador.ativo }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao atualizar operador')
      return
    }

    onAtualizado()
  }

  async function excluir(operador: Operador) {
    if (!confirm(`Excluir "${operador.nome}"?`)) return

    const res = await fetch(apiUrl('/api/operadores'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: operador.id }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Erro ao excluir operador')
      return
    }

    onAtualizado()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Operadores</h3>
          <p className="text-sm text-slate-500">
            Cadastro manual da equipe que opera máquinas e tanques na produção.
          </p>
        </div>

        {!criando && (
          <button
            onClick={() => setCriando(true)}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            + Novo operador
          </button>
        )}
      </div>

      {criando && (
        <form onSubmit={criar} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nome do operador"
              required
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
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
              <th className="px-4 py-3 text-left">Criado em</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {operadores.map((operador) =>
              editandoId === operador.id ? (
                <tr key={operador.id} className="bg-amber-50/70">
                  <td colSpan={3} className="px-4 py-4">
                    <form onSubmit={(e) => salvarEdicao(e, operador.id)} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                      <input
                        value={nomeEdicao}
                        onChange={(e) => setNomeEdicao(e.target.value)}
                        required
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                      />
                      <button
                        type="submit"
                        disabled={salvando}
                        className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
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
                <tr key={operador.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{operador.nome}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(operador.criado_em).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => iniciarEdicao(operador)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleAtivo(operador)}
                        className={`rounded-full px-3 py-1 text-sm ${
                          operador.ativo
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {operador.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                      <button
                        onClick={() => excluir(operador)}
                        className="rounded-xl bg-red-50 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}

            {operadores.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  Nenhum operador cadastrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
