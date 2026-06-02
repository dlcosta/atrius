'use client'
import { apiUrl } from '@/lib/api'

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
  const [cor, setCor] = useState(produto?.cor ?? '#5B9BD5')
  const [packageVolumeLiters, setPackageVolumeLiters] = useState(
    produto?.package_volume_liters != null ? String(produto.package_volume_liters) : ''
  )
  const [unitsPerBox, setUnitsPerBox] = useState(String(produto?.units_per_box ?? 1))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')

    try {
      const body = {
        sku,
        nome,
        volume_base: Number(produto?.volume_base ?? 3800),
        tempo_limpeza_min: Number(produto?.tempo_limpeza_min ?? 0),
        cor,
        tempos_maquinas: produto?.tempos_maquinas ?? {},
        package_volume_liters: packageVolumeLiters !== '' ? Number(packageVolumeLiters) : null,
        units_per_box: Number(unitsPerBox || 1),
      }
      const method = produto ? 'PATCH' : 'POST'
      const payload = produto ? { ...body, id: produto.id } : body

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const res = await fetch(apiUrl('/api/produtos'), {
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
        setErro(data.error ?? 'Erro ao salvar produto')
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setErro('Timeout ao salvar produto. Tente novamente.')
      } else {
        setErro(String(error) || 'Erro ao salvar produto')
      }
      console.error('Erro ao salvar produto:', error)
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
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nome do produto</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            placeholder="Ex: Amaciante 2L"
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

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">
          Dados de embalagem
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Volume da embalagem (L)
            </label>
            <input
              type="number"
              min={0}
              step="0.001"
              value={packageVolumeLiters}
              onChange={(e) => setPackageVolumeLiters(e.target.value)}
              placeholder="Ex: 2"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
            />
            <p className="mt-1 text-xs text-slate-500">Volume por unidade (ex: 2 para 2L)</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Unidades por caixa
            </label>
            <input
              type="number"
              min={1}
              step="1"
              value={unitsPerBox}
              onChange={(e) => setUnitsPerBox(e.target.value)}
              placeholder="Ex: 4"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
            />
            <p className="mt-1 text-xs text-slate-500">Quantidade de unidades por caixa</p>
          </div>
        </div>

        {packageVolumeLiters && Number(packageVolumeLiters) > 0 && Number(unitsPerBox) > 0 && (
          <p className="mt-3 text-sm font-medium text-blue-700">
            Volume por caixa:{' '}
            <span className="font-semibold">
              {parseFloat((Number(packageVolumeLiters) * Number(unitsPerBox)).toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} L
            </span>
          </p>
        )}
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : produto ? 'Atualizar produto' : 'Criar produto'}
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
