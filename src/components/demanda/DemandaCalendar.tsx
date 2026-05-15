'use client'

import { useState, useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ItemDemanda, Tanque } from '@/types'
import { TanqueSelector } from './TanqueSelector'
import type { Ordem } from '@/types'

type Props = {
  itensIniciais: ItemDemanda[]
  ordensAgendadas: Ordem[]
  tanques: Tanque[]
  onOrdemCriada?: () => void
}

type DiaAgrupado = {
  data: string
  itens: ItemDemanda[]
  categorias: string[]
}

const SEM_DATA_KEY = '__sem_data__'

function getDataKey(item: ItemDemanda) {
  return item.data_prevista?.slice(0, 10) || SEM_DATA_KEY
}

function formatDiaLabel(data: string) {
  if (data === SEM_DATA_KEY) return 'Sem entrega'
  return format(parseISO(data), 'dd/MM')
}

function formatDiaTitulo(data: string) {
  if (data === SEM_DATA_KEY) return 'Itens sem entrega prevista'
  return format(parseISO(data), "EEEE, dd 'de' MMMM", { locale: ptBR })
}

export function DemandaCalendar({ itensIniciais, ordensAgendadas, tanques, onOrdemCriada }: Props) {
  const [dataSelecionada, setDataSelecionada] = useState<string | null>(null)
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(null)

  // Agrupar itens por data
  const diasComDemanda = useMemo(() => {
    const porData = new Map<string, ItemDemanda[]>()
    for (const item of itensIniciais) {
      const dataKey = getDataKey(item)
      if (!porData.has(dataKey)) porData.set(dataKey, [])
      porData.get(dataKey)!.push(item)
    }
    return Array.from(porData.entries())
      .sort(([a], [b]) => {
        if (a === SEM_DATA_KEY) return -1
        if (b === SEM_DATA_KEY) return 1
        return a.localeCompare(b)
      })
      .map(([data, itens]) => ({
        data,
        itens,
        categorias: [...new Set(itens.map((i) => i.categoria_produto))].sort(),
      }))
  }, [itensIniciais])

  // Criar mapa para lookup rápido
  const diaMap = useMemo(() => {
    const map = new Map<string, DiaAgrupado>()
    for (const dia of diasComDemanda) {
      map.set(dia.data, dia)
    }
    return map
  }, [diasComDemanda])


  if (categoriaSelecionada && dataSelecionada) {
    // Filtrar itens para mostrar apenas aqueles que existem no calendário
    const datasValidas = new Set(diasComDemanda.map(dia => dia.data))
    const itensValidos = itensIniciais.filter(item => {
      const dataKey = getDataKey(item)
      return datasValidas.has(dataKey)
    })

    return (
      <TanqueSelector
        dataSelecionada={dataSelecionada}
        categoriaSelecionada={categoriaSelecionada}
        itensIniciais={itensValidos}
        ordensAgendadas={ordensAgendadas}
        tanques={tanques}
        onBack={() => {
          setCategoriaSelecionada(null)
        }}
        onOrdemCriada={() => {
          onOrdemCriada?.()
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Dias de entrega */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Dias com entrega prevista</h3>
        <div className="flex flex-wrap gap-2">
          {diasComDemanda.length > 0 ? (
            diasComDemanda.map((dia) => (
              <button
                key={dia.data}
                onClick={() => setDataSelecionada(dia.data)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  dataSelecionada === dia.data
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-blue-100 hover:text-blue-700'
                }`}
              >
                <div>{formatDiaLabel(dia.data)}</div>
                <div className="text-xs font-normal opacity-75 mt-0.5">
                  {dia.itens.reduce((acc, i) => acc + i.total_litros, 0).toLocaleString('pt-BR')}L
                </div>
              </button>
            ))
          ) : (
            <p className="text-sm text-slate-500">Nenhuma demanda nos próximos dias</p>
          )}
        </div>
      </div>

      {/* Categorias da data selecionada */}
      {dataSelecionada && diaMap.get(dataSelecionada) && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900">
              {formatDiaTitulo(dataSelecionada)}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              {diaMap.get(dataSelecionada)!.itens.reduce((acc, i) => acc + i.total_litros, 0).toLocaleString('pt-BR')}L em {diaMap.get(dataSelecionada)!.categorias.length} categoria{diaMap.get(dataSelecionada)!.categorias.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {diaMap.get(dataSelecionada)!.categorias.map((cat) => {
              const itensCat = diaMap.get(dataSelecionada)!.itens.filter((i) => i.categoria_produto === cat)
              const totalLitros = itensCat.reduce((acc, i) => acc + i.total_litros, 0)
              return (
                <button
                  key={cat}
                  onClick={() => setCategoriaSelecionada(cat)}
                  className="p-4 bg-gradient-to-br from-blue-50 to-blue-25 border border-blue-200 rounded-lg hover:shadow-md hover:border-blue-400 transition-all text-left group"
                >
                  <div className="font-semibold text-base text-slate-900 group-hover:text-blue-700">
                    {cat}
                  </div>
                  <div className="text-sm text-slate-600 mt-2">
                    {totalLitros.toLocaleString('pt-BR')}L - {itensCat.length} {itensCat.length === 1 ? 'item' : 'itens'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Sem data selecionada */}
      {!dataSelecionada && diasComDemanda.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-slate-400">
          <Calendar size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhum item pendente de produção</p>
        </div>
      )}
    </div>
  )
}
