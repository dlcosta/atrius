'use client'

import { useState, useCallback, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar } from 'lucide-react'
import type { ItemDemanda, Tanque } from '@/types'
import { CategoriaAccordion } from './CategoriaAccordion'

type Props = {
  itensIniciais: ItemDemanda[]
  tanques: Tanque[]
}

type GrupoData = {
  data: string
  categorias: GrupoCategoria[]
}

type GrupoCategoria = {
  categoria: string
  itens: ItemDemanda[]
}

function agrupar(itens: ItemDemanda[]): GrupoData[] {
  const porData = new Map<string, Map<string, ItemDemanda[]>>()

  for (const item of itens) {
    const dataKey = item.data_prevista?.slice(0, 10) ?? 'sem-data'
    if (!porData.has(dataKey)) porData.set(dataKey, new Map())
    const porCategoria = porData.get(dataKey)!
    if (!porCategoria.has(item.categoria_produto)) porCategoria.set(item.categoria_produto, [])
    porCategoria.get(item.categoria_produto)!.push(item)
  }

  return Array.from(porData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, categorias]) => ({
      data,
      categorias: Array.from(categorias.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([categoria, itens]) => ({ categoria, itens })),
    }))
}

function formatarData(dataIso: string): string {
  try {
    return format(parseISO(dataIso), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  } catch {
    return dataIso
  }
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

      {/* Grupos por data */}
      <div className="space-y-8">
        {grupos.map((grupo) => (
          <div key={grupo.data}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-slate-400" />
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                {formatarData(grupo.data)}
              </h2>
            </div>
            <div className="space-y-2">
              {grupo.categorias.map((cat) => {
                const key = `${grupo.data}::${cat.categoria}`
                return (
                  <CategoriaAccordion
                    key={key}
                    categoria={cat.categoria}
                    itens={cat.itens}
                    tanques={tanques}
                    expandido={expandido === key}
                    onToggle={() => toggleExpandido(key)}
                    onOrdemCriada={recarregar}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
