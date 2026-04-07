'use client'
import { useState } from 'react'
import type { Produto } from '@/types'

type Props = {
  produto?: Produto
  onSalvo: () => void
  onCancelar: () => void
}

export function ProdutoForm({ produto, onSalvo, onCancelar }: Props) {
  const [sku, setSku] = useState(produto?.sku ?? '')
  const [nome, setNome] = useState(produto?.nome ?? '')
  const [tempoProducao, setTempoProducao] = useState(String(produto?.tempo_producao_min ?? ''))
  const [tempoLimpeza, setTempoLimpeza] = useState(String(produto?.tempo_limpeza_min ?? '0'))
  const [cor, setCor] = useState(produto?.cor ?? '#5B9BD5')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')

    const body = { sku, nome, tempo_producao_min: tempoProducao, tempo_limpeza_min: tempoLimpeza, cor }
    const method = produto ? 'PATCH' : 'POST'
    const payload = produto ? { ...body, id: produto.id } : body

    const res = await fetch('/api/produtos', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      onSalvo()
    } else {
      const data = await res.json()
      setErro(data.error ?? 'Erro ao salvar')
    }
    setSalvando(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
            disabled={!!produto}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Produto</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tempo de Produção (min)</label>
          <input
            type="number"
            value={tempoProducao}
            onChange={(e) => setTempoProducao(e.target.value)}
            required
            min="1"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tempo de Limpeza (min)</label>
          <input
            type="number"
            value={tempoLimpeza}
            onChange={(e) => setTempoLimpeza(e.target.value)}
            min="0"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cor no Gantt</label>
          <input
            type="color"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            className="w-16 h-9 border border-gray-300 rounded cursor-pointer"
          />
        </div>
      </div>
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : produto ? 'Atualizar' : 'Criar'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
