'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ItemDemanda, Tanque } from '@/types'
import { CategoriaSelector } from './CategoriaSelector'

type Props = {
  itensIniciais: ItemDemanda[]
  tanques: Tanque[]
}

type DiaAgrupado = {
  data: string
  itens: ItemDemanda[]
  categorias: string[]
}

export function DemandaCalendar({ itensIniciais, tanques }: Props) {
  const [mes, setMes] = useState(new Date())
  const [dataSelecionada, setDataSelecionada] = useState<string | null>(null)
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(null)

  // Agrupar itens por data
  const diasComDemanda = useMemo(() => {
    const porData = new Map<string, ItemDemanda[]>()
    for (const item of itensIniciais) {
      const dataKey = item.data_prevista?.slice(0, 10) ?? ''
      if (!dataKey) continue
      if (!porData.has(dataKey)) porData.set(dataKey, [])
      porData.get(dataKey)!.push(item)
    }
    return Array.from(porData.entries()).map(([data, itens]) => ({
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

  // Gerar dias do calendário
  const diasCalendario = useMemo(() => {
    const inicio = startOfMonth(mes)
    const fim = endOfMonth(mes)
    return eachDayOfInterval({ start: inicio, end: fim })
  }, [mes])

  if (categoriaSelecionada && dataSelecionada) {
    return (
      <CategoriaSelector
        dataSelecionada={dataSelecionada}
        categoriaSelecionada={categoriaSelecionada}
        itensIniciais={itensIniciais}
        tanques={tanques}
        onBack={() => {
          setCategoriaSelecionada(null)
        }}
        onOrdemCriada={() => {
          setDataSelecionada(null)
          setCategoriaSelecionada(null)
        }}
      />
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Dias de entrega */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Dias com Demanda</h3>
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
                <div>{format(parseISO(dia.data), 'dd/MM')}</div>
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

      <div className="bg-white rounded-lg shadow">
        {/* Cabeçalho do calendário */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <button
            onClick={() => setMes(addMonths(mes, -1))}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} className="text-slate-600" />
          </button>
          <h2 className="text-lg font-semibold text-slate-900">
            {format(mes, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <button
            onClick={() => setMes(addMonths(mes, 1))}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronRight size={20} className="text-slate-600" />
          </button>
        </div>

        {/* Grid do calendário */}
        <div className="p-4">
          {/* Cabeçalho com dias da semana */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((dia) => (
              <div key={dia} className="text-center text-xs font-semibold text-slate-600 py-2">
                {dia}
              </div>
            ))}
          </div>

          {/* Dias do mês */}
          <div className="grid grid-cols-7 gap-1">
            {diasCalendario.map((dia) => {
              const dataKey = format(dia, 'yyyy-MM-dd')
              const diaAgrupado = diaMap.get(dataKey)
              const temDemanda = !!diaAgrupado
              const isFromCurrentMonth = isSameMonth(dia, mes)

              return (
                <button
                  key={dataKey}
                  onClick={() => temDemanda && setDataSelecionada(dataKey)}
                  disabled={!temDemanda}
                  className={`aspect-square p-2 rounded-lg border-2 text-xs transition-all ${
                    !isFromCurrentMonth
                      ? 'bg-slate-50 border-slate-100 text-slate-300'
                      : temDemanda
                        ? 'border-blue-300 bg-blue-50 hover:bg-blue-100 cursor-pointer'
                        : 'border-slate-200 bg-white text-slate-400'
                  } ${dataSelecionada === dataKey ? 'ring-2 ring-blue-500' : ''}`}
                >
                  <div className="font-semibold">{format(dia, 'd')}</div>
                  {diaAgrupado && (
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      {diaAgrupado.itens.reduce((acc, item) => acc + item.total_litros, 0).toLocaleString('pt-BR')}L
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Detalhes da data selecionada */}
        {dataSelecionada && diaMap.get(dataSelecionada) && (
          <div className="border-t border-slate-200 p-4 bg-slate-50">
            <div className="mb-4">
              <h3 className="font-semibold text-slate-900 mb-3">
                {format(parseISO(dataSelecionada), "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {diaMap.get(dataSelecionada)!.categorias.map((cat) => {
                  const itensCat = diaMap.get(dataSelecionada)!.itens.filter((i) => i.categoria_produto === cat)
                  const totalLitros = itensCat.reduce((acc, i) => acc + i.total_litros, 0)
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategoriaSelecionada(cat)}
                      className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all text-left group"
                    >
                      <div className="font-semibold text-sm text-slate-900 group-hover:text-blue-700">
                        {cat}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {totalLitros.toLocaleString('pt-BR')}L • {itensCat.length} item{itensCat.length > 1 ? 'ns' : ''}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            <button
              onClick={() => setDataSelecionada(null)}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              ← Voltar ao calendário
            </button>
          </div>
        )}

        {/* Sem demanda */}
        {diasComDemanda.length === 0 && !dataSelecionada && (
          <div className="p-8 text-center text-slate-400">
            <Calendar size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">Nenhum item pendente de produção</p>
          </div>
        )}
      </div>
    </div>
  )
}
