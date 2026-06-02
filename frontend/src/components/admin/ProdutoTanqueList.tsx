'use client'
import { apiUrl } from '@/lib/api'

import { useState } from 'react'
import type { ProdutoTanque } from '@/types'
import { ProdutoTanqueForm } from './ProdutoTanqueForm'

type Props = {
  produtosTanque: ProdutoTanque[]
  onAtualizado: () => void
}

export function ProdutoTanqueList({ produtosTanque, onAtualizado }: Props) {
  const [editando, setEditando] = useState<ProdutoTanque | null>(null)
  const [criando, setCriando] = useState(false)

  async function deletar(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"?`)) return
    const res = await fetch(apiUrl('/api/produtos-tanque'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })

    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? 'Erro ao excluir fórmula')
      return
    }

    onAtualizado()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Fórmulas de Tanque</h3>
          <p className="text-sm text-slate-500">
            Fórmulas base para produção em tanque — sem variantes de embalagem.
          </p>
        </div>

        {!criando && (
          <button
            onClick={() => setCriando(true)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            + Nova fórmula
          </button>
        )}
      </div>

      {criando && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <ProdutoTanqueForm
            onSalvo={() => {
              setCriando(false)
              onAtualizado()
            }}
            onCancelar={() => setCriando(false)}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-center">Cor</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {produtosTanque.map((produto) => (
              <tr key={produto.id}>
                {editando?.id === produto.id ? (
                  <td colSpan={4} className="bg-slate-50 px-4 py-3">
                    <ProdutoTanqueForm
                      produto={produto}
                      onSalvo={() => {
                        setEditando(null)
                        onAtualizado()
                      }}
                      onCancelar={() => setEditando(null)}
                    />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-mono text-slate-600">{produto.sku}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{produto.nome}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-block h-5 w-5 rounded-full border border-slate-300"
                        style={{ backgroundColor: produto.cor }}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditando(produto)}
                        className="mr-3 text-blue-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deletar(produto.id, produto.nome)}
                        className="text-red-600 hover:underline"
                      >
                        Excluir
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {produtosTanque.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Nenhuma fórmula de tanque cadastrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
