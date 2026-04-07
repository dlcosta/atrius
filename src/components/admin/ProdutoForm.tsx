'use client'
import { useMemo, useState } from 'react'
import type { Produto, Maquina, TempoMaquina } from '@/types'

type Props = {
  maquinas: Maquina[]
  produto?: Produto
  onSalvo: () => void
  onCancelar: () => void
}

function normalizarTempos(
  maquinas: Maquina[],
  origem: Record<string, TempoMaquina> | undefined
): Record<string, TempoMaquina> {
  const base: Record<string, TempoMaquina> = {}
  maquinas.forEach((maquina) => {
    base[maquina.id] = {
      setup: Number(origem?.[maquina.id]?.setup ?? 0),
      producao: Number(origem?.[maquina.id]?.producao ?? 0),
    }
  })
  return base
}

export function ProdutoForm({ maquinas, produto, onSalvo, onCancelar }: Props) {
  const [sku, setSku] = useState(produto?.sku ?? '')
  const [nome, setNome] = useState(produto?.nome ?? '')
  const [volumeBase, setVolumeBase] = useState(String(produto?.volume_base ?? 3800))
  const [cor, setCor] = useState(produto?.cor ?? '#5B9BD5')
  const [tempos, setTempos] = useState<Record<string, TempoMaquina>>(
    normalizarTempos(maquinas, produto?.tempos_maquinas)
  )

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const maquinasAtivas = useMemo(() => maquinas.filter((m) => m.ativa), [maquinas])

  function handleTempoChange(maquinaId: string, campo: 'setup' | 'producao', valor: string) {
    setTempos((prev) => ({
      ...prev,
      [maquinaId]: {
        ...prev[maquinaId],
        [campo]: Number(valor),
      },
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')

    const body = {
      sku,
      nome,
      volume_base: Number(volumeBase),
      tempo_limpeza_min: 0,
      cor,
      tempos_maquinas: tempos,
    }
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
      setErro(data.error ?? 'Erro ao salvar produto')
    }

    setSalvando(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="col-span-2 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
            disabled={!!produto}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm disabled:bg-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        <div className="col-span-2 md:col-span-3">
          <label className="block text-sm font-medium text-slate-700 mb-1">Nome do produto</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        <div className="col-span-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">Volume base (L)</label>
          <input
            type="number"
            value={volumeBase}
            onChange={(e) => setVolumeBase(e.target.value)}
            required
            min="1"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        <div className="col-span-1 md:col-span-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">Cor no Gantt</label>
          <input
            type="color"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            className="w-full h-9 border border-slate-300 rounded-md cursor-pointer bg-white"
          />
        </div>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Tempos por maquina (base no volume configurado)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {maquinasAtivas.map((m) => {
            const t = tempos[m.id] || { setup: 0, producao: 0 }
            return (
              <div key={m.id} className="bg-slate-50 border border-slate-200 rounded-md p-3">
                <div className="font-semibold text-xs text-slate-900 mb-2 uppercase tracking-wider">{m.nome}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Setup (min)</label>
                    <input
                      type="number"
                      value={t.setup || ''}
                      onChange={(e) => handleTempoChange(m.id, 'setup', e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Produção (min)</label>
                    <input
                      type="number"
                      value={t.producao || ''}
                      onChange={(e) => handleTempoChange(m.id, 'producao', e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {erro && <p className="text-red-600 text-sm">{erro}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={salvando}
          className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          {salvando ? 'Salvando...' : produto ? 'Atualizar produto' : 'Criar produto'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="px-6 py-2 border border-slate-300 rounded-md text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
