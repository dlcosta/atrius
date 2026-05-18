'use client'

import { useState, useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ItemDemanda, Tanque, Turno } from '@/types'
import { TanqueSelector } from './TanqueSelector'
import type { Ordem } from '@/types'

type RepetitionInfo = {
  count: number
  temAnterior: boolean
  temPosterior: boolean
  outrasDatas: string[]
}

function getRepetitionInfo(cat: string, dataSelecionada: string, categoriaPorData: Map<string, Set<string>>): RepetitionInfo | null {
  const datas = categoriaPorData.get(cat)
  if (!datas) return null
  const outras = [...datas].filter((d) => d !== dataSelecionada)
  if (outras.length === 0) return null
  const temAnterior = outras.some((d) => d < dataSelecionada)
  const temPosterior = outras.some((d) => d > dataSelecionada)
  return { count: outras.length, temAnterior, temPosterior, outrasDatas: outras.sort() }
}

function badgeClasses(info: RepetitionInfo): string {
  if (info.temAnterior && info.temPosterior) return 'bg-emerald-500 text-white'
  if (info.temAnterior) return 'bg-blue-500 text-white'
  return 'bg-purple-500 text-white'
}

function cardHighlight(info: RepetitionInfo | null): string {
  if (!info) return ''
  if (info.temAnterior && info.temPosterior) return 'ring-1 ring-emerald-300'
  if (info.temAnterior) return 'ring-1 ring-blue-300'
  return 'ring-1 ring-purple-300'
}

function formatTooltipDates(datas: string[]): string {
  return datas.map((d) => {
    try { return format(parseISO(d), "dd/MM", { locale: ptBR }) } catch { return d }
  }).join(', ')
}

type Props = {
  itensIniciais: ItemDemanda[]
  ordensAgendadas: Ordem[]
  tanques: Tanque[]
  turnos: Turno[]
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

export function DemandaCalendar({ itensIniciais, ordensAgendadas, tanques, turnos, onOrdemCriada }: Props) {
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
    const dias = Array.from(porData.entries())
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
    console.log('[DemandaCalendar] Datas encontradas:', dias.map(d => d.data))
    return dias
  }, [itensIniciais])

  // Criar mapa para lookup rápido
  const diaMap = useMemo(() => {
    const map = new Map<string, DiaAgrupado>()
    for (const dia of diasComDemanda) {
      map.set(dia.data, dia)
    }
    return map
  }, [diasComDemanda])

  // Mapa de categoria → conjunto de datas (para badges de repetição)
  const categoriaPorData = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const item of itensIniciais) {
      const data = item.data_prevista?.slice(0, 10)
      if (!data) continue
      if (!map.has(item.categoria_produto)) map.set(item.categoria_produto, new Set())
      map.get(item.categoria_produto)!.add(data)
    }
    return map
  }, [itensIniciais])


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
        turnos={turnos}
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
              const rep = dataSelecionada !== SEM_DATA_KEY
                ? getRepetitionInfo(cat, dataSelecionada, categoriaPorData)
                : null
              return (
                <button
                  key={cat}
                  onClick={() => setCategoriaSelecionada(cat)}
                  className={`relative p-4 bg-gradient-to-br from-blue-50 to-blue-25 border border-blue-200 rounded-lg hover:shadow-md hover:border-blue-400 transition-all text-left group ${cardHighlight(rep)}`}
                >
                  {rep && (
                    <div className="absolute top-2 right-2 group/badge">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold leading-none ${badgeClasses(rep)}`}
                        title={`Também em: ${formatTooltipDates(rep.outrasDatas)}`}
                      >
                        {rep.count}
                      </span>
                      {/* Tooltip desktop */}
                      <div className="absolute right-0 top-6 z-10 hidden group-hover/badge:block bg-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg pointer-events-none">
                        Também em: {formatTooltipDates(rep.outrasDatas)}
                        <div className="absolute -top-1.5 right-2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-slate-800" />
                      </div>
                    </div>
                  )}
                  <div className="font-semibold text-base text-slate-900 group-hover:text-blue-700 pr-6">
                    {cat}
                  </div>
                  <div className="text-sm text-slate-600 mt-2">
                    {totalLitros.toLocaleString('pt-BR')}L - {itensCat.length} {itensCat.length === 1 ? 'item' : 'itens'}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Legenda de repetição (só aparece se houver algum badge) */}
          {dataSelecionada !== SEM_DATA_KEY && diaMap.get(dataSelecionada)!.categorias.some(
            (cat) => getRepetitionInfo(cat, dataSelecionada, categoriaPorData) !== null
          ) && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 border-t border-slate-100 pt-3">
              <span className="font-medium text-slate-400">Repetição entre datas:</span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-blue-500 inline-flex items-center justify-center text-white text-xs font-bold leading-none">1</span>
                Dias anteriores
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-purple-500 inline-flex items-center justify-center text-white text-xs font-bold leading-none">1</span>
                Dias seguintes
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-emerald-500 inline-flex items-center justify-center text-white text-xs font-bold leading-none">2</span>
                Ambos os lados
              </span>
            </div>
          )}
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
