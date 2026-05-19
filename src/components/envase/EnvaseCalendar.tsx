'use client'

import { useState, useMemo } from 'react'
import { FlaskConical } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ItemDemandaEnvase, Maquina, Ordem } from '@/types'
import { MaquinaSelector } from './MaquinaSelector'

type RepetitionInfo = {
  count: number
  temAnterior: boolean
  temPosterior: boolean
  outrasDatas: string[]
}

// Key for a packaging group: produto_base + embalagem_volume_ml
function grupoKey(item: ItemDemandaEnvase) {
  return `${item.produto_base}::${item.embalagem_volume_ml}`
}

function getRepetitionInfo(
  key: string,
  dataSelecionada: string,
  grupoPorData: Map<string, Set<string>>
): RepetitionInfo | null {
  const datas = grupoPorData.get(key)
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
  return datas
    .map((d) => {
      try { return format(parseISO(d), 'dd/MM', { locale: ptBR }) } catch { return d }
    })
    .join(', ')
}

const SEM_DATA_KEY = '__sem_data__'

function getDataKey(item: ItemDemandaEnvase) {
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

type GrupoNaData = {
  key: string
  produtoBase: string
  embalagemLabel: string
  embalagemVolumeMl: number
  itens: ItemDemandaEnvase[]
  totalLitros: number
  totalEmbalagens: number
}

type Props = {
  itensIniciais: ItemDemandaEnvase[]
  maquinas: Maquina[]
  ordensTanque: Ordem[]
  onOrdemCriada?: () => void
}

export function EnvaseCalendar({ itensIniciais, maquinas, ordensTanque, onOrdemCriada }: Props) {
  const [dataSelecionada, setDataSelecionada] = useState<string | null>(null)
  const [grupoSelecionado, setGrupoSelecionado] = useState<GrupoNaData | null>(null)

  // Group items by date
  const diasComDemanda = useMemo(() => {
    const porData = new Map<string, ItemDemandaEnvase[]>()
    for (const item of itensIniciais) {
      const key = getDataKey(item)
      if (!porData.has(key)) porData.set(key, [])
      porData.get(key)!.push(item)
    }
    return Array.from(porData.entries())
      .sort(([a], [b]) => {
        if (a === SEM_DATA_KEY) return -1
        if (b === SEM_DATA_KEY) return 1
        return a.localeCompare(b)
      })
      .map(([data, itens]) => ({ data, itens }))
  }, [itensIniciais])

  const diaMap = useMemo(() => {
    return new Map(diasComDemanda.map((d) => [d.data, d]))
  }, [diasComDemanda])

  // Map: grupoKey → set of dates (for repetition badges)
  const grupoPorData = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const item of itensIniciais) {
      const data = item.data_prevista?.slice(0, 10)
      if (!data) continue
      const key = grupoKey(item)
      if (!map.has(key)) map.set(key, new Set())
      map.get(key)!.add(data)
    }
    return map
  }, [itensIniciais])

  // Compute packaging groups for a given date
  function getGruposDaData(data: string): GrupoNaData[] {
    const itens = diaMap.get(data)?.itens ?? []
    const grupos = new Map<string, GrupoNaData>()
    for (const item of itens) {
      const key = grupoKey(item)
      if (!grupos.has(key)) {
        grupos.set(key, {
          key,
          produtoBase: item.produto_base,
          embalagemLabel: item.embalagem_label,
          embalagemVolumeMl: item.embalagem_volume_ml,
          itens: [],
          totalLitros: 0,
          totalEmbalagens: 0,
        })
      }
      const g = grupos.get(key)!
      g.itens.push(item)
      g.totalLitros += item.total_litros
      g.totalEmbalagens += item.quantidade * item.unidades_por_cx
    }
    return Array.from(grupos.values()).sort((a, b) => {
      const baseCompare = a.produtoBase.localeCompare(b.produtoBase)
      if (baseCompare !== 0) return baseCompare
      return a.embalagemVolumeMl - b.embalagemVolumeMl
    })
  }

  if (grupoSelecionado && dataSelecionada) {
    return (
      <MaquinaSelector
        dataSelecionada={dataSelecionada}
        grupoProdutoBase={grupoSelecionado.produtoBase}
        grupoEmbalagemLabel={grupoSelecionado.embalagemLabel}
        grupoEmbalagemVolumeMl={grupoSelecionado.embalagemVolumeMl}
        itensIniciais={itensIniciais}
        maquinas={maquinas}
        ordensTanque={ordensTanque}
        onBack={() => setGrupoSelecionado(null)}
        onOrdemCriada={() => {
          setGrupoSelecionado(null)
          onOrdemCriada?.()
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Date picker strip */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Dias com entrega prevista</h3>
        <div className="flex flex-wrap gap-2">
          {diasComDemanda.length > 0 ? (
            diasComDemanda.map((dia) => {
              const totalL = dia.itens.reduce((acc, i) => acc + i.total_litros, 0)
              return (
                <button
                  key={dia.data}
                  onClick={() => setDataSelecionada(dia.data)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                    dataSelecionada === dia.data
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-700'
                  }`}
                >
                  <div>{formatDiaLabel(dia.data)}</div>
                  <div className="text-xs font-normal opacity-75 mt-0.5">
                    {totalL.toLocaleString('pt-BR')}L
                  </div>
                </button>
              )
            })
          ) : (
            <p className="text-sm text-slate-500">Nenhuma demanda de envase pendente</p>
          )}
        </div>
      </div>

      {/* Groups for selected date */}
      {dataSelecionada && diaMap.get(dataSelecionada) && (() => {
        const grupos = getGruposDaData(dataSelecionada)
        const totalLitrosDia = grupos.reduce((acc, g) => acc + g.totalLitros, 0)
        return (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900">{formatDiaTitulo(dataSelecionada)}</h3>
              <p className="text-sm text-slate-600 mt-1">
                {totalLitrosDia.toLocaleString('pt-BR')}L em {grupos.length} grupo{grupos.length !== 1 ? 's' : ''} de produto
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {grupos.map((grupo) => {
                const rep =
                  dataSelecionada !== SEM_DATA_KEY
                    ? getRepetitionInfo(grupo.key, dataSelecionada, grupoPorData)
                    : null
                return (
                  <button
                    key={grupo.key}
                    onClick={() => setGrupoSelecionado(grupo)}
                    className={`relative p-4 bg-gradient-to-br from-emerald-50 to-emerald-25 border border-emerald-200 rounded-lg hover:shadow-md hover:border-emerald-400 transition-all text-left group ${cardHighlight(rep)}`}
                  >
                    {rep && (
                      <div className="absolute top-2 right-2 group/badge">
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold leading-none ${badgeClasses(rep)}`}
                          title={`Também em: ${formatTooltipDates(rep.outrasDatas)}`}
                        >
                          {rep.count}
                        </span>
                        <div className="absolute right-0 top-6 z-10 hidden group-hover/badge:block bg-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg pointer-events-none">
                          Também em: {formatTooltipDates(rep.outrasDatas)}
                          <div className="absolute -top-1.5 right-2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-slate-800" />
                        </div>
                      </div>
                    )}
                    <div className="font-semibold text-base text-slate-900 group-hover:text-emerald-700 pr-6">
                      {grupo.produtoBase}
                    </div>
                    <div className="text-sm font-medium text-emerald-700 mt-0.5">{grupo.embalagemLabel}</div>
                    <div className="text-sm text-slate-600 mt-2">
                      {grupo.totalLitros.toLocaleString('pt-BR')}L —{' '}
                      {grupo.totalEmbalagens.toLocaleString('pt-BR')} emb. —{' '}
                      {grupo.itens.length} {grupo.itens.length === 1 ? 'pedido' : 'pedidos'}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Repetition legend */}
            {dataSelecionada !== SEM_DATA_KEY &&
              grupos.some((g) => getRepetitionInfo(g.key, dataSelecionada, grupoPorData) !== null) && (
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
        )
      })()}

      {/* Empty state */}
      {!dataSelecionada && diasComDemanda.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-slate-400">
          <FlaskConical size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Nenhum item de envase pendente de produção</p>
        </div>
      )}
    </div>
  )
}
