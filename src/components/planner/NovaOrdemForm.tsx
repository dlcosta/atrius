'use client'
import { useState } from 'react'
import { format } from 'date-fns'
import type { Produto } from '@/types'

type Props = {
  produtos: Produto[]
  dataInicial: Date
  onSalvo: () => void
  onFechar: () => void
}

export function NovaOrdemForm({ produtos, dataInicial, onSalvo, onFechar }: Props) {
  const [produtoSku, setProdutoSku] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [unidade, setUnidade] = useState('L')
  const [etapa, setEtapa] = useState<'tanque' | 'envase'>('envase')
  const [tanque, setTanque] = useState('')
  const [lote, setLote] = useState('')
  const [dataPrevista, setDataPrevista] = useState(format(dataInicial, 'yyyy-MM-dd'))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)

    try {
      const res = await fetch('/api/ordens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_sku: produtoSku,
          quantidade: Number(quantidade),
          unidade,
          etapa,
          tanque: tanque || null,
          lote: lote || null,
          data_prevista: dataPrevista,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setErro(data.error ?? 'Erro ao criar ordem')
      } else {
        onSalvo()
      }
    } catch {
      setErro('Erro de rede')
    }

    setSalvando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Nova ordem manual</h2>
        <p className="text-sm text-slate-500 mb-4">Preencha etapa, tanque e lote para manter o fluxo tanque para envase.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Produto</label>
            <select
              value={produtoSku}
              onChange={(e) => setProdutoSku(e.target.value)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Selecione...</option>
              {produtos.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantidade</label>
              <input
                type="number"
                min="1"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unidade</label>
              <input
                type="text"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value.toUpperCase())}
                maxLength={8}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Etapa</label>
              <select
                value={etapa}
                onChange={(e) => setEtapa(e.target.value as 'tanque' | 'envase')}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="tanque">Tanque</option>
                <option value="envase">Envase</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tanque</label>
              <input
                type="text"
                placeholder="tq3"
                value={tanque}
                onChange={(e) => setTanque(e.target.value.toLowerCase())}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lote</label>
              <input
                type="text"
                placeholder="lt906"
                value={lote}
                onChange={(e) => setLote(e.target.value.toLowerCase())}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Data prevista</label>
            <input
              type="date"
              value={dataPrevista}
              onChange={(e) => setDataPrevista(e.target.value)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onFechar}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Criar ordem'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
