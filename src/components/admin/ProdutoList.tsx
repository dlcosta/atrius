'use client'
import { useState } from 'react'
import type { Produto, Maquina } from '@/types'
import { ProdutoForm } from './ProdutoForm'

type Props = {
  produtos: Produto[]
  maquinas: Maquina[]
  onAtualizado: () => void
}

export function ProdutoList({ produtos, maquinas, onAtualizado }: Props) {
  const [editando, setEditando] = useState<Produto | null>(null)
  const [criando, setCriando] = useState(false)

  async function deletar(id: string, nome: string) {
    if (!confirm(`Excluir \"${nome}\"?`)) return
    const res = await fetch('/api/produtos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })

    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? 'Erro ao excluir produto')
      return
    }

    onAtualizado()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Produtos</h2>
          <p className="text-sm text-slate-500">Defina o tempo de cada maquina considerando o volume base do produto.</p>
        </div>

        {!criando && (
          <button
            onClick={() => setCriando(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            + Novo produto
          </button>
        )}
      </div>

      {criando && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
          <ProdutoForm
            maquinas={maquinas}
            onSalvo={() => {
              setCriando(false)
              onAtualizado()
            }}
            onCancelar={() => setCriando(false)}
          />
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wider font-semibold">
            <tr>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-right">Volume base</th>
              <th className="px-4 py-3 text-center">Cor</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {produtos.map((p) => (
              <tr key={p.id}>
                {editando?.id === p.id ? (
                  <td colSpan={5} className="px-4 py-3 bg-slate-50">
                    <ProdutoForm
                      maquinas={maquinas}
                      produto={p}
                      onSalvo={() => {
                        setEditando(null)
                        onAtualizado()
                      }}
                      onCancelar={() => setEditando(null)}
                    />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-mono text-slate-600">{p.sku}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p.nome}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{p.volume_base || 3800} L</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-block w-5 h-5 rounded-full border border-slate-300"
                        style={{ backgroundColor: p.cor }}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditando(p)}
                        className="text-blue-600 hover:underline mr-3"
                      >
                        Editar
                      </button>
                      <button onClick={() => deletar(p.id, p.nome)} className="text-red-600 hover:underline">
                        Excluir
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {produtos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Nenhum produto cadastrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
