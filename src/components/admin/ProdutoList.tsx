'use client'
import { useState } from 'react'
import type { Produto } from '@/types'
import { ProdutoForm } from './ProdutoForm'

type Props = {
  produtos: Produto[]
  onAtualizado: () => void
}

export function ProdutoList({ produtos, onAtualizado }: Props) {
  const [editando, setEditando] = useState<Produto | null>(null)
  const [criando, setCriando] = useState(false)

  async function deletar(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"?`)) return
    await fetch('/api/produtos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    onAtualizado()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Produtos</h2>
        {!criando && (
          <button
            onClick={() => setCriando(true)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            + Novo Produto
          </button>
        )}
      </div>

      {criando && (
        <div className="border border-blue-200 bg-blue-50 rounded p-4 mb-4">
          <ProdutoForm
            onSalvo={() => { setCriando(false); onAtualizado() }}
            onCancelar={() => setCriando(false)}
          />
        </div>
      )}

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-right">Produção (min)</th>
              <th className="px-4 py-3 text-right">Limpeza (min)</th>
              <th className="px-4 py-3 text-center">Cor</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {produtos.map((p) => (
              <tr key={p.id}>
                {editando?.id === p.id ? (
                  <td colSpan={6} className="px-4 py-3">
                    <ProdutoForm
                      produto={p}
                      onSalvo={() => { setEditando(null); onAtualizado() }}
                      onCancelar={() => setEditando(null)}
                    />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-mono text-gray-600">{p.sku}</td>
                    <td className="px-4 py-3 font-medium">{p.nome}</td>
                    <td className="px-4 py-3 text-right">{p.tempo_producao_min}</td>
                    <td className="px-4 py-3 text-right">{p.tempo_limpeza_min}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-block w-5 h-5 rounded-full border border-gray-300"
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
                      <button
                        onClick={() => deletar(p.id, p.nome)}
                        className="text-red-600 hover:underline"
                      >
                        Excluir
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {produtos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
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
