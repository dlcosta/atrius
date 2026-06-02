'use client'
import { apiUrl } from '@/lib/api'

import { useState } from 'react'
import type { ProdutoTanque } from '@/types'

type Props = {
  produto?: ProdutoTanque
  onSalvo: () => void
  onCancelar: () => void
}

export function ProdutoTanqueForm({ produto, onSalvo, onCancelar }: Props) {
  const [sku, setSku] = useState(produto?.sku ?? '')
  const [nome, setNome] = useState(produto?.nome ?? '')
  const [cor, setCor] = useState(produto?.cor ?? '#5B9BD5')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function sugerirSku(valor: string) {
    setNome(valor)
    if (!produto) {
      setSku(valor.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, ''))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')

    try {
      const body = { sku, nome, cor }
      const method = produto ? 'PATCH' : 'POST'
      const payload = produto ? { ...body, id: produto.id } : body

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const res = await fetch(apiUrl('/api/produtos-tanque'), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (res.ok) {
        onSalvo()
      } else {
        const data = await res.json()
        setErro(data.error ?? 'Erro ao salvar fórmula de tanque')
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setErro('Timeout ao salvar. Tente novamente.')
      } else {
        setErro(String(error) || 'Erro ao salvar fórmula de tanque')
      }
      console.error('Erro ao salvar fórmula de tanque:', error)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[180px_1fr_120px]">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">SKU</label>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
            disabled={!!produto}
            placeholder="Ex: AMACIANTE"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono transition-all focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nome da fórmula</label>
          <input
            value={nome}
            onChange={(e) => sugerirSku(e.target.value)}
            required
            placeholder="Ex: Amaciante Concentrado"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Cor</label>
          <input
            type="color"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            className="h-10 w-full cursor-pointer rounded-md border border-slate-300 bg-white"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Fórmulas de tanque identificam o produto sendo produzido — sem variantes de embalagem. Ex: "Amaciante", "Detergente".
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : produto ? 'Atualizar fórmula' : 'Criar fórmula'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-md border border-slate-300 bg-white px-6 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
