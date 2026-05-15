'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import type { ItemDemanda, Tanque } from '@/types'
import { CategoriaAccordion } from './CategoriaAccordion'

type Props = {
  itensIniciais: ItemDemanda[]
  tanques: Tanque[]
}

type GrupoCategoria = {
  categoria: string
  itens: ItemDemanda[]
}

function agrupar(itens: ItemDemanda[]): GrupoCategoria[] {
  const porCategoria = new Map<string, ItemDemanda[]>()

  for (const item of itens) {
    if (!porCategoria.has(item.categoria_produto)) porCategoria.set(item.categoria_produto, [])
    porCategoria.get(item.categoria_produto)!.push(item)
  }

  return Array.from(porCategoria.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([categoria, itens]) => ({
      categoria,
      itens: itens.sort((a, b) => {
        const da = a.data_prevista?.slice(0, 10) ?? ''
        const db = b.data_prevista?.slice(0, 10) ?? ''
        return da.localeCompare(db)
      }),
    }))
}

export function DemandaList({ itensIniciais, tanques }: Props) {
  const [itens, setItens] = useState<ItemDemanda[]>(itensIniciais)
  const [mostrarAlocados, setMostrarAlocados] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await fetch(`/api/demanda${mostrarAlocados ? '?mostrar_alocados=true' : ''}`)
      if (res.ok) {
        const dados = await res.json()
        setItens(dados)
      }
    } finally {
      setCarregando(false)
    }
  }, [mostrarAlocados])

  useEffect(() => {
    recarregar()
  }, [mostrarAlocados, recarregar])

  const itensFiltrados = useMemo(
    () => (mostrarAlocados ? itens : itens.filter((i) => !i.alocado)),
    [itens, mostrarAlocados]
  )

  const grupos = useMemo(() => agrupar(itensFiltrados), [itensFiltrados])

  function toggleExpandido(key: string) {
    setExpandido((prev) => (prev === key ? null : key))
  }

  if (grupos.length === 0 && !carregando) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Calendar size={40} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">Nenhum item pendente de produção</p>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">Demanda de Produção</h1>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={mostrarAlocados}
            onChange={(e) => setMostrarAlocados(e.target.checked)}
            className="accent-blue-600"
          />
          <span className="text-sm text-slate-600 select-none">Mostrar alocados</span>
        </label>
      </div>

      {carregando && (
        <div className="text-center py-4 text-sm text-slate-400">Atualizando...</div>
      )}

      {/* Grupos por categoria */}
      <div className="space-y-2">
        {grupos.map((cat) => (
          <CategoriaAccordion
            key={cat.categoria}
            categoria={cat.categoria}
            itens={cat.itens}
            tanques={tanques}
            expandido={expandido === cat.categoria}
            onToggle={() => toggleExpandido(cat.categoria)}
            onOrdemCriada={recarregar}
          />
        ))}
      </div>
    </div>
  )
}
