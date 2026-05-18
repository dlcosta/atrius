'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, Plus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ItemDemanda, Ordem, Tanque, Turno } from '@/types'
import { TanqueProgressBar } from './TanqueProgressBar'
import { ItemPedidoRow } from './ItemPedidoRow'

type Props = {
  dataSelecionada: string
  categoriaSelecionada: string
  itensIniciais: ItemDemanda[]
  ordensAgendadas: Ordem[]
  tanques: Tanque[]
  turnos: Turno[]
  onBack: () => void
  onOrdemCriada: () => void
}

const SEM_DATA_KEY = '__sem_data__'

function getDataKey(item: ItemDemanda) {
  return item.data_prevista?.slice(0, 10) || SEM_DATA_KEY
}

function getHojeYmd() {
  return format(new Date(), 'yyyy-MM-dd')
}

function formatDataSelecionada(data: string) {
  if (data === SEM_DATA_KEY) return 'sem entrega prevista'
  return format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR })
}

function itemKey(item: ItemDemanda) {
  return `${item.numero_pedido}::${item.produto_descricao}::${item.data_prevista?.slice(0, 10) ?? ''}`
}

export function TanqueSelector({
  dataSelecionada,
  categoriaSelecionada,
  itensIniciais,
  ordensAgendadas,
  tanques,
  turnos,
  onBack,
  onOrdemCriada,
}: Props) {
  const [tanqueSelecionado, setTanqueSelecionado] = useState<string | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [nomeOrdem, setNomeOrdem] = useState<string>('')
  const [diaExecucao, setDiaExecucao] = useState<string>(getHojeYmd())
  const [turnoId, setTurnoId] = useState<string>(turnos[0]?.id ?? '')
  const [tempoProducaoMin, setTempoProducaoMin] = useState<number | null>(null)
  const [tempoLimpezaMin, setTempoLimpezaMin] = useState<number>(0)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function minutesToTime(minutes: number) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  function turnoLabel(id: string) {
    const turno = turnos.find((t) => t.id === id)
    return turno ? `${turno.nome} (${minutesToTime(turno.hora_inicio)} – ${minutesToTime(turno.hora_fim)})` : id
  }

  // Itens da categoria selecionada
  const itensDaCategoria = useMemo(() => {
    return itensIniciais.filter(
      (item) => {
        const itemData = item.data_prevista?.slice(0, 10) || ''
        const dataSelecionadaKey = dataSelecionada === SEM_DATA_KEY ? '' : dataSelecionada
        // Mostrar itens que têm data >= data selecionada (não mostrar datas passadas)
        const passaFiltroData = !dataSelecionadaKey || (itemData && itemData >= dataSelecionadaKey)
        return (
          item.categoria_produto === categoriaSelecionada &&
          !item.alocado &&
          passaFiltroData
        )
      }
    )
  }, [itensIniciais, categoriaSelecionada, dataSelecionada])

  const litrosDaCategoria = itensDaCategoria.reduce((acc, item) => acc + item.total_litros, 0)

  const litrosSelecionados = itensDaCategoria
    .filter((item) => selecionados.has(itemKey(item)))
    .reduce((acc, item) => acc + item.total_litros, 0)

  // Duração do turno selecionado em minutos
  const duracaoTurnoMin = useMemo(() => {
    const turno = turnos.find((t) => t.id === turnoId)
    if (!turno) return 0
    return Math.max(0, turno.hora_fim - turno.hora_inicio)
  }, [turnos, turnoId])

  // Calcular utilização do tanque no dia/turno selecionado (volume + tempo)
  const utilizacaoTanque = useMemo(() => {
    if (!tanqueSelecionado || !ordensAgendadas) return { litros: 0, percentual: 0, minutos: 0, percentualTempo: 0 }
    const tanque = tanques.find((t) => t.id === tanqueSelecionado)
    if (!tanque) return { litros: 0, percentual: 0, minutos: 0, percentualTempo: 0 }

    const ordensNoTanque = ordensAgendadas.filter(
      (o) =>
        o.tank_id === tanqueSelecionado &&
        o.data_prevista?.slice(0, 10) === diaExecucao &&
        (o.turno_id ?? turnos[0]?.id) === turnoId
    )

    const litersUsados = ordensNoTanque.reduce((acc, o) => acc + (o.quantidade ?? 0), 0)
    const minutosUsados = ordensNoTanque.reduce((acc, o) => acc + (o.total_duration_minutes ?? 0), 0)
    const percentualVolume = (litersUsados / tanque.volume_liters) * 100
    const percentualTempo = duracaoTurnoMin > 0 ? (minutosUsados / duracaoTurnoMin) * 100 : 0

    return { litros: litersUsados, percentual: percentualVolume, minutos: minutosUsados, percentualTempo }
  }, [tanqueSelecionado, diaExecucao, turnoId, tanques, ordensAgendadas, turnos, duracaoTurnoMin])

  const tanqueObj = tanques.find((t) => t.id === tanqueSelecionado)
  const capacidadeDisponivel = tanqueObj
    ? Math.max(0, tanqueObj.volume_liters - utilizacaoTanque.litros)
    : 0

  const totalDuracaoNovaOrdem = (tempoProducaoMin ?? 0) + tempoLimpezaMin
  const minutosDisponiveis = Math.max(0, duracaoTurnoMin - utilizacaoTanque.minutos)
  const tempoInsuficiente = tempoProducaoMin !== null && tempoProducaoMin > 0 && totalDuracaoNovaOrdem > minutosDisponiveis && minutosDisponiveis > 0

  const volumeExcede = litrosSelecionados > capacidadeDisponivel
  const podeAgendar =
    litrosSelecionados > 0 &&
    !volumeExcede &&
    tempoProducaoMin !== null &&
    tempoProducaoMin > 0 &&
    !tempoInsuficiente
  // Todos os itens são selecionáveis — a máquina processa 1 ordem por vez, o gate é tempo não volume
  const todosSelecionados =
    itensDaCategoria.length > 0 &&
    itensDaCategoria.every((item) => selecionados.has(itemKey(item)))

  function handleChange(item: ItemDemanda, checked: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (checked) next.add(itemKey(item))
      else next.delete(itemKey(item))
      return next
    })
  }

  function handleSelecionarTodos(checked: boolean) {
    if (!checked) {
      setSelecionados(new Set())
      return
    }
    setSelecionados(new Set(itensDaCategoria.map(itemKey)))
  }

  async function handleCriarOrdem() {
    if (!podeAgendar || !tanqueSelecionado || !nomeOrdem.trim() || !diaExecucao) return

    const itensSelecionados = itensDaCategoria.filter((item) => selecionados.has(itemKey(item)))

    const dataPrevista = itensSelecionados
      .map((i) => i.data_prevista?.slice(0, 10) ?? '')
      .filter(Boolean)
      .sort()[0] ?? diaExecucao

    setCriando(true)
    setErro(null)

    try {
      const resOrdem = await fetch('/api/demanda/ordens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria_produto: categoriaSelecionada,
          nome_ordem: nomeOrdem.trim(),
          data_prevista: dataPrevista,
          tank_id: tanqueSelecionado,
          total_litros: litrosSelecionados,
          production_time_minutes: tempoProducaoMin,
          cleaning_time_minutes: tempoLimpezaMin,
          itens: itensSelecionados.map((item) => ({
            numero_pedido: item.numero_pedido,
            produto_descricao: item.produto_descricao,
            quantidade: item.quantidade,
            total_litros: item.total_litros,
          })),
        }),
      })

      if (!resOrdem.ok) {
        const json = await resOrdem.json()
        setErro(json.error ?? 'Erro ao criar ordem')
        return
      }

      setSelecionados(new Set())
      setNomeOrdem('')
      setTempoProducaoMin(null)
      setTempoLimpezaMin(0)
      setDiaExecucao(getHojeYmd())
      setTurnoId(turnos[0]?.id ?? '')
      onOrdemCriada()
    } catch {
      setErro('Erro de rede ao criar ordem')
    } finally {
      setCriando(false)
    }
  }

  // Se tanque não foi selecionado, mostra seletor de tanque
  if (!tanqueSelecionado) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 mb-6 transition-colors"
        >
          <ChevronLeft size={16} />
          Voltar
        </button>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-blue-25 px-6 py-4 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-900">{categoriaSelecionada}</h2>
            <p className="text-sm text-slate-600 mt-1">Entrega prevista: {formatDataSelecionada(dataSelecionada)}</p>
            <p className="text-sm text-slate-700 mt-2">
              <span className="font-semibold">{litrosDaCategoria.toLocaleString('pt-BR')}L</span> a produzir em{' '}
              <span className="font-semibold">{itensDaCategoria.length}</span>{' '}
              {itensDaCategoria.length === 1 ? 'item' : 'itens'}
            </p>
          </div>

          <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Data de producao</label>
              <input
                type="date"
                value={diaExecucao}
                onChange={(e) => {
                  setDiaExecucao(e.target.value)
                  setSelecionados(new Set())
                }}
                className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Turno de producao</label>
              {turnos.length === 0 ? (
                <p className="text-sm text-amber-600 py-2">Nenhum turno cadastrado. Cadastre turnos na aba Cadastros.</p>
              ) : (
                <select
                  value={turnoId}
                  onChange={(e) => {
                    setTurnoId(e.target.value)
                    setSelecionados(new Set())
                  }}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {turnos.map((turno) => (
                    <option key={turno.id} value={turno.id}>
                      {turno.nome} ({minutesToTime(turno.hora_inicio)} – {minutesToTime(turno.hora_fim)})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Resumo de disponibilidade */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Disponibilidade em {format(parseISO(diaExecucao), 'dd/MM/yyyy', { locale: ptBR })} - {turnoLabel(turnoId)}
            </h3>
            {tanques.length === 0 ? (
              <p className="text-sm text-amber-600">Nenhum tanque cadastrado. Cadastre tanques na aba Cadastros.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {tanques.map((tanque) => {
                  const ordensNoTanque = (ordensAgendadas || []).filter((o) => {
                    const dataAgend = o.data_prevista?.slice(0, 10)
                    return (
                      o.tank_id === tanque.id &&
                      dataAgend === diaExecucao &&
                      (o.turno_id ?? turnos[0]?.id) === turnoId
                    )
                  })
                  const litersUsados = ordensNoTanque.reduce((acc, o) => acc + (o.quantidade ?? 0), 0)
                  const minutosUsados = ordensNoTanque.reduce((acc, o) => acc + (o.total_duration_minutes ?? 0), 0)
                  const percentualVolume = (litersUsados / tanque.volume_liters) * 100
                  const percentualTempo = duracaoTurnoMin > 0 ? (minutosUsados / duracaoTurnoMin) * 100 : 0
                  const livres = tanque.volume_liters - litersUsados
                  const minDisp = Math.max(0, duracaoTurnoMin - minutosUsados)

                  function fmtMin(m: number) {
                    const h = Math.floor(m / 60)
                    const min = m % 60
                    return h > 0 ? `${h}h${min > 0 ? String(min).padStart(2, '0') : ''}` : `${min}min`
                  }

                  return (
                    <div key={tanque.id} className="bg-white rounded p-3 text-sm">
                      <div className="font-semibold text-slate-900">{tanque.nome}</div>
                      {duracaoTurnoMin > 0 ? (
                        <>
                          <div className="text-xs mt-1">
                            <span className={`font-bold ${minDisp === 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmtMin(minDisp)}</span>
                            <span className="text-slate-500"> livres de {fmtMin(duracaoTurnoMin)}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1.5">
                            <div
                              className={`h-full transition-all ${
                                percentualTempo > 90 ? 'bg-red-400' : percentualTempo > 70 ? 'bg-orange-400' : 'bg-blue-400'
                              }`}
                              style={{ width: `${Math.min(percentualTempo, 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{percentualTempo.toFixed(0)}% do turno usado</div>
                          <div className="text-xs text-slate-400 mt-1.5 border-t border-slate-100 pt-1">
                            Vol: {livres.toLocaleString('pt-BR')}L livres
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-slate-600 mt-1">
                            Livre: <span className="font-bold">{livres.toLocaleString('pt-BR')}L</span> / {litersUsados.toLocaleString('pt-BR')}L usado
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                            <div
                              className={`h-full transition-all ${
                                percentualVolume > 90 ? 'bg-red-500' : percentualVolume > 70 ? 'bg-orange-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(percentualVolume, 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-slate-500 mt-1">{percentualVolume.toFixed(0)}% volume</div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Seletor de tanque */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Escolher tanque para esta producao</h3>
            {tanques.length === 0 ? (
              <p className="text-sm text-amber-600">Nenhum tanque cadastrado. Cadastre tanques na aba Cadastros.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {tanques.map((tanque) => (
                  <button
                    key={tanque.id}
                    onClick={() => setTanqueSelecionado(tanque.id)}
                    className="p-4 rounded-lg border-2 border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition-all text-left"
                  >
                    <div className="font-semibold text-slate-900">{tanque.nome}</div>
                    <div className="text-sm text-slate-600 mt-2">
                      {tanque.volume_liters.toLocaleString('pt-BR')}L
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    )
  }

  // Tanque selecionado, mostra formulário
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={() => setTanqueSelecionado(null)}
        className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 mb-6 transition-colors"
      >
        <ChevronLeft size={16} />
        Voltar para seleção de tanque
      </button>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-blue-25 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{categoriaSelecionada}</h2>
            <p className="text-sm text-slate-600 mt-1">
              Tanque: <span className="font-semibold">{tanqueObj?.nome}</span>
            </p>
            <p className="text-sm text-slate-700 mt-2">
              <span className="font-semibold">{litrosDaCategoria.toLocaleString('pt-BR')}L</span> a produzir em{' '}
              <span className="font-semibold">{itensDaCategoria.length}</span>{' '}
              {itensDaCategoria.length === 1 ? 'item' : 'itens'}
            </p>
          </div>
        </div>

        {/* Controles */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
          {/* Dia + Turno */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Dia de Execução</label>
              <input
                type="date"
                value={diaExecucao}
                onChange={(e) => setDiaExecucao(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Turno</label>
              {turnos.length === 0 ? (
                <p className="text-sm text-amber-600 py-2">Nenhum turno cadastrado.</p>
              ) : (
                <select
                  value={turnoId}
                  onChange={(e) => setTurnoId(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {turnos.map((turno) => (
                    <option key={turno.id} value={turno.id}>
                      {turno.nome} ({minutesToTime(turno.hora_inicio)} – {minutesToTime(turno.hora_fim)})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Disponibilidade — tempo é o fator primário */}
          <div className="bg-white rounded-lg p-3 border border-slate-200 space-y-2">
            {duracaoTurnoMin > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Tempo disponível no turno</span>
                  <span className={`text-sm font-bold ${tempoInsuficiente ? 'text-red-600' : minutosDisponiveis === 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {(() => {
                      const h = Math.floor(minutosDisponiveis / 60)
                      const m = minutosDisponiveis % 60
                      return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}min`
                    })()} livres de {(() => {
                      const h = Math.floor(duracaoTurnoMin / 60)
                      const m = duracaoTurnoMin % 60
                      return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}min`
                    })()}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      utilizacaoTanque.percentualTempo > 90 ? 'bg-red-400' : utilizacaoTanque.percentualTempo > 70 ? 'bg-orange-400' : 'bg-blue-400'
                    }`}
                    style={{ width: `${Math.min(utilizacaoTanque.percentualTempo, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Já usado: {utilizacaoTanque.minutos}min</span>
                  {tempoProducaoMin !== null && tempoProducaoMin > 0 && (
                    <span className={tempoInsuficiente ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                      Esta ordem: {totalDuracaoNovaOrdem}min
                    </span>
                  )}
                </div>
                {tempoInsuficiente && (
                  <div className="text-xs text-red-600 font-semibold bg-red-50 rounded px-2 py-1">
                    Tempo insuficiente: {totalDuracaoNovaOrdem}min necessários, apenas {minutosDisponiveis}min disponíveis
                  </div>
                )}
                <div className="pt-1 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Volume selecionado</span>
                    <span className={volumeExcede ? 'text-red-600 font-semibold' : ''}>
                      {litrosSelecionados.toLocaleString('pt-BR')}L / {(tanqueObj?.volume_liters ?? 0).toLocaleString('pt-BR')}L
                      {volumeExcede && ' — excede capacidade'}
                    </span>
                  </div>
                  <TanqueProgressBar
                    litrosSelecionados={utilizacaoTanque.litros + litrosSelecionados}
                    capacidadeTanque={tanqueObj?.volume_liters ?? 0}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-900">Volume disponível</span>
                  <span className="text-sm font-bold text-slate-600">
                    {(capacidadeDisponivel - litrosSelecionados).toLocaleString('pt-BR')}L livres
                  </span>
                </div>
                <TanqueProgressBar
                  litrosSelecionados={utilizacaoTanque.litros + litrosSelecionados}
                  capacidadeTanque={tanqueObj?.volume_liters ?? 0}
                />
              </>
            )}
          </div>
        </div>

        {/* Lista de itens */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700 mb-3">
            <span>Itens disponiveis ({itensDaCategoria.length})</span>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={todosSelecionados}
                disabled={itensDaCategoria.length === 0}
                onChange={(event) => handleSelecionarTodos(event.target.checked)}
                className="accent-blue-600"
              />
              Selecionar todos
            </label>
          </div>
          <div className="space-y-3">
            {(() => {
              const porData = new Map<string, ItemDemanda[]>()
              for (const item of itensDaCategoria) {
                const dataKey = item.data_prevista?.slice(0, 10).trim() || '__sem_data__'
                if (!porData.has(dataKey)) porData.set(dataKey, [])
                porData.get(dataKey)!.push(item)
              }
              const datasOrdenadas = Array.from(porData.keys()).sort((a, b) => {
                if (a === '__sem_data__') return 1
                if (b === '__sem_data__') return -1
                return a.localeCompare(b)
              })
              return datasOrdenadas.map((dataKey) => (
                <div key={dataKey}>
                  <div className="text-xs font-bold text-blue-600 px-3 py-2">
                    Entrega: {dataKey === '__sem_data__' ? 'Sem data' : format(parseISO(dataKey), 'dd/MM/yyyy', { locale: ptBR })}
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {porData.get(dataKey)!.map((item) => (
                      <ItemPedidoRow
                        key={itemKey(item)}
                        item={item}
                        selecionado={selecionados.has(itemKey(item))}
                        bloqueado={false}
                        onChange={handleChange}
                      />
                    ))}
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div className="mx-6 my-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {erro}
          </div>
        )}

        {/* Nome + Tempo + Botão */}
        {selecionados.size > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 space-y-3">
            <input
              type="text"
              placeholder="Digite um nome para a ordem..."
              value={nomeOrdem}
              onChange={(e) => setNomeOrdem(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Tempo de produção (min) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="ex: 120"
                  value={tempoProducaoMin ?? ''}
                  onChange={(e) => setTempoProducaoMin(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Tempo de limpeza (min)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="ex: 30"
                  value={tempoLimpezaMin}
                  onChange={(e) => setTempoLimpezaMin(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {tempoProducaoMin !== null && tempoProducaoMin > 0 && (
              <div className="text-xs text-slate-600">
                Total de uso do turno:{' '}
                <span className={`font-semibold ${tempoInsuficiente ? 'text-red-600' : 'text-slate-800'}`}>
                  {totalDuracaoNovaOrdem}min
                </span>
                {duracaoTurnoMin > 0 && (
                  <span className="text-slate-500"> de {duracaoTurnoMin}min do turno</span>
                )}
              </div>
            )}
            <button
              onClick={handleCriarOrdem}
              disabled={criando || !podeAgendar || !nomeOrdem.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Plus size={16} />
              {criando
                ? 'Criando...'
                : tempoInsuficiente
                  ? `Tempo insuficiente (${totalDuracaoNovaOrdem}min > ${minutosDisponiveis}min disponíveis)`
                  : volumeExcede
                    ? `Volume excede o tanque (${litrosSelecionados.toLocaleString('pt-BR')}L > ${(tanqueObj?.volume_liters ?? 0).toLocaleString('pt-BR')}L)`
                    : `Criar no Backlog — ${litrosSelecionados.toLocaleString('pt-BR')}L · ${totalDuracaoNovaOrdem > 0 ? totalDuracaoNovaOrdem + 'min' : 'informe o tempo'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
