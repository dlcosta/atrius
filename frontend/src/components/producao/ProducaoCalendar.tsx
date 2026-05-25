'use client'
import { apiUrl } from '@/lib/api'

import { useState, useMemo } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react'
import type { Ordem, Tanque, Turno } from '@/types'

type Props = {
  ordens: Ordem[]
  tanques: Tanque[]
  turnos?: Turno[]
}

type DiaProducao = {
  data: string
  turnos: TurnoProducao[]
}

type TurnoProducao = {
  turno: Turno
  tanques: TanqueProducao[]
}

type TanqueProducao = {
  tanque: Tanque
  ordens: Ordem[]
  utilizacao: number
  utilizacaoTempo: number
  duracaoTurnoMin: number
  minutosUsados: number
}

type Agendamento = {
  turnoId: string
  tanqueId: string
}

function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function ProducaoCalendar({ ordens, tanques, turnos = [] }: Props) {
  const [diaBase, setDiaBase] = useState(new Date())
  const [ordemSelecionada, setOrdemSelecionada] = useState<Ordem | null>(null)
  const [agendamentos, setAgendamentos] = useState<Record<string, Agendamento>>({})

  // Ordens BACKLOG disponíveis (sem agendamentos)
  const ordensBacklog = useMemo(() => {
    return ordens.filter((o) => o.planning_status === 'BACKLOG' && !agendamentos[o.id])
  }, [ordens, agendamentos])

  // Gerar 7 dias a partir de hoje
  const dias = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const data = addDays(diaBase, i)
      return format(data, 'yyyy-MM-dd')
    })
  }, [diaBase])

  // Construir calendário com agendamentos
  const calendario = useMemo((): DiaProducao[] => {
    return dias.map((data) => ({
      data,
      turnos: turnos.map((turno) => {
        const duracaoTurnoMin = Math.max(0, turno.hora_fim - turno.hora_inicio)
        return {
          turno,
          tanques: tanques.map((tanque) => {
            const ordensDoTanque = ordens.filter((o) => {
              const agendamento = agendamentos[o.id]
              return (
                agendamento &&
                agendamento.turnoId === turno.id &&
                agendamento.tanqueId === tanque.id
              )
            })

            const litersUsados = ordensDoTanque.reduce((acc, o) => acc + (o.quantidade ?? 0), 0)
            const minutosUsados = ordensDoTanque.reduce((acc, o) => acc + (o.total_duration_minutes ?? 0), 0)
            const percentualVolume = tanque.volume_liters > 0 ? (litersUsados / tanque.volume_liters) * 100 : 0
            const percentualTempo = duracaoTurnoMin > 0 ? (minutosUsados / duracaoTurnoMin) * 100 : 0

            return {
              tanque,
              ordens: ordensDoTanque,
              utilizacao: percentualVolume,
              utilizacaoTempo: percentualTempo,
              duracaoTurnoMin,
              minutosUsados,
            }
          }),
        }
      }),
    }))
  }, [dias, turnos, tanques, ordens, agendamentos])

  async function handleAgendar(ordem: Ordem, data: string, turnoId: string, tanqueId: string) {
    try {
      // Encontrar turno para pegar nome
      const turno = turnos.find((t) => t.id === turnoId)
      if (!turno) throw new Error('Turno não encontrado')

      const res = await fetch(apiUrl('/api/producao/agendamentos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordem_id: ordem.id,
          tank_id: tanqueId,
          turno_id: turnoId,
          turno_nome: turno.nome,
          data_agendamento: data,
        }),
      })

      if (!res.ok) {
        const erro = await res.json()
        alert(`Erro ao agendar: ${erro.error}`)
        return
      }

      // Só atualiza local se salvou no banco
      setAgendamentos((prev) => ({
        ...prev,
        [ordem.id]: { turnoId, tanqueId },
      }))
      setOrdemSelecionada(null)
    } catch (err) {
      alert(`Erro ao agendar: ${err instanceof Error ? err.message : 'desconhecido'}`)
    }
  }

  async function handleDesagendar(ordemId: string) {
    try {
      // Encontrar agendamento para pegar ID
      const agendamento = Object.entries(agendamentos).find(([id]) => id === ordemId)
      if (!agendamento) throw new Error('Agendamento não encontrado')

      const res = await fetch(apiUrl(`/api/)producao/agendamentos?id=${ordemId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const erro = await res.json()
        alert(`Erro ao desagendar: ${erro.error}`)
        return
      }

      // Só remove local se deletou no banco
      setAgendamentos((prev) => {
        const next = { ...prev }
        delete next[ordemId]
        return next
      })
    } catch (err) {
      alert(`Erro ao desagendar: ${err instanceof Error ? err.message : 'desconhecido'}`)
    }
  }

  function handleTanqueClick(data: string, turnoId: string, tanqueId: string) {
    if (!ordemSelecionada) return

    const tanque = tanques.find((t) => t.id === tanqueId)
    if (!tanque) return

    const turno = turnos.find((t) => t.id === turnoId)
    const duracaoTurnoMin = turno ? Math.max(0, turno.hora_fim - turno.hora_inicio) : 0

    const ordensDoTanque = ordens.filter((o) => {
      const agendamento = agendamentos[o.id]
      return agendamento && agendamento.turnoId === turnoId && agendamento.tanqueId === tanqueId
    })

    const litersAtual = ordensDoTanque.reduce((acc, o) => acc + (o.quantidade ?? 0), 0)
    const minutosAtual = ordensDoTanque.reduce((acc, o) => acc + (o.total_duration_minutes ?? 0), 0)
    const novoLitros = litersAtual + (ordemSelecionada.quantidade ?? 0)
    const novosMinutos = minutosAtual + (ordemSelecionada.total_duration_minutes ?? 0)

    if (novoLitros > tanque.volume_liters) {
      alert(
        `❌ Volume insuficiente!\n\n${tanque.nome}: ${tanque.volume_liters.toLocaleString('pt-BR')}L\nAtual: ${litersAtual.toLocaleString('pt-BR')}L\nNova ordem: ${(ordemSelecionada.quantidade ?? 0).toLocaleString('pt-BR')}L`
      )
      return
    }

    if (duracaoTurnoMin > 0 && novosMinutos > duracaoTurnoMin) {
      alert(
        `❌ Tempo insuficiente no turno!\n\nTurno: ${duracaoTurnoMin}min disponíveis\nJá usado: ${minutosAtual}min\nNova ordem: ${(ordemSelecionada.total_duration_minutes ?? 0)}min\nTotal: ${novosMinutos}min`
      )
      return
    }

    handleAgendar(ordemSelecionada, data, turnoId, tanqueId)
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Produção - Calendário de Turnos</h1>
          <p className="text-sm text-slate-600 mt-1">Planeje as ordens BACKLOG por dia e turno</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setDiaBase(addDays(diaBase, -7))}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm font-semibold min-w-max">
            {format(diaBase, 'dd MMM', { locale: ptBR })} - {format(addDays(diaBase, 6), 'dd MMM yyyy', { locale: ptBR })}
          </span>
          <button
            onClick={() => setDiaBase(addDays(diaBase, 7))}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {turnos.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
          Nenhum turno cadastrado. Vá até a aba <strong>Cadastros</strong> para criar os turnos de produção.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Coluna esquerda: Ordens BACKLOG */}
        <div className="bg-white rounded-lg shadow p-4 h-fit">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Ordens BACKLOG ({ordensBacklog.length})</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {ordensBacklog.map((ordem) => {
              const agendada = !!agendamentos[ordem.id]
              return (
                <button
                  key={ordem.id}
                  onClick={() => setOrdemSelecionada(ordem)}
                  disabled={agendada}
                  className={`w-full text-left p-2 rounded-lg border text-xs transition-all ${
                    agendada
                      ? 'bg-slate-50 border-slate-200 text-slate-500 opacity-50'
                      : ordemSelecionada?.id === ordem.id
                        ? 'bg-blue-50 border-blue-400 shadow-md'
                        : 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-sm'
                  }`}
                >
                  <div className="font-semibold truncate">{ordem.numero_externo || `Ordem ${ordem.id?.slice(0, 8)}`}</div>
                  <div className="text-slate-600 mt-1">
                    {ordem.quantidade?.toLocaleString('pt-BR')}L • {ordem.tanque || 'Sem categoria'}
                  </div>
                  <div className="text-slate-500 mt-0.5">{ordem.data_prevista?.slice(0, 10) || 'Sem data'}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Coluna direita: Calendário */}
        <div className="lg:col-span-3 space-y-4">
          {calendario.map((dia) => (
            <div key={dia.data} className="bg-white rounded-lg shadow overflow-hidden">
              {/* Header do dia */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-25 px-4 py-3 border-b border-slate-200">
                <h3 className="font-bold text-slate-900">
                  {format(parseISO(dia.data), 'EEEE, dd MMMM', { locale: ptBR })}
                </h3>
              </div>

              {/* Turnos */}
              <div className="divide-y divide-slate-200">
                {dia.turnos.map((turnoProducao) => (
                  <div key={turnoProducao.turno.id} className="p-4">
                    {/* Header turno */}
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                      <Clock size={16} className="text-slate-600" />
                      <span className="font-semibold text-slate-900">{turnoProducao.turno.nome}</span>
                      <span className="text-xs text-slate-600">
                        {minutesToTime(turnoProducao.turno.hora_inicio)} – {minutesToTime(turnoProducao.turno.hora_fim)}
                      </span>
                    </div>

                    {/* Tanques do turno */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {turnoProducao.tanques.map((tanqueProducao) => {
                          const volumeExcede = Boolean(
                            ordemSelecionada &&
                              tanqueProducao.utilizacao + ((ordemSelecionada.quantidade ?? 0) / tanqueProducao.tanque.volume_liters) * 100 > 100
                          )
                          const tempoExcede = Boolean(
                            ordemSelecionada &&
                              tanqueProducao.duracaoTurnoMin > 0 &&
                              tanqueProducao.minutosUsados + (ordemSelecionada.total_duration_minutes ?? 0) > tanqueProducao.duracaoTurnoMin
                          )
                          const bloqueado = volumeExcede || tempoExcede
                          return (
                        <button
                          key={tanqueProducao.tanque.id}
                          onClick={() => handleTanqueClick(dia.data, turnoProducao.turno.id, tanqueProducao.tanque.id)}
                          disabled={Boolean(ordemSelecionada && bloqueado)}
                          className={`p-3 rounded-lg border-2 transition-all text-left ${
                            ordemSelecionada
                              ? bloqueado
                                ? 'border-red-300 bg-red-50 cursor-not-allowed opacity-50'
                                : 'border-dashed border-blue-400 bg-blue-25 cursor-pointer hover:bg-blue-50'
                              : 'border-slate-200 bg-slate-50 cursor-default'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-sm text-slate-900">
                              {tanqueProducao.tanque.nome}
                            </span>
                            <div className="text-right">
                              <span className="text-xs font-semibold text-slate-600">
                                Vol: {tanqueProducao.utilizacao.toFixed(0)}%
                              </span>
                              {tanqueProducao.duracaoTurnoMin > 0 && (
                                <span className={`text-xs font-semibold ml-2 ${tanqueProducao.utilizacaoTempo > 90 ? 'text-red-600' : 'text-blue-600'}`}>
                                  Tempo: {tanqueProducao.utilizacaoTempo.toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Barra de progresso - volume */}
                          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1">
                            <div
                              className={`h-full transition-all ${
                                tanqueProducao.utilizacao > 90
                                  ? 'bg-red-500'
                                  : tanqueProducao.utilizacao > 70
                                    ? 'bg-orange-500'
                                    : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(tanqueProducao.utilizacao, 100)}%` }}
                            />
                          </div>

                          {/* Barra de progresso - tempo */}
                          {tanqueProducao.duracaoTurnoMin > 0 && (
                            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-2">
                              <div
                                className={`h-full transition-all ${
                                  tanqueProducao.utilizacaoTempo > 90
                                    ? 'bg-red-400'
                                    : tanqueProducao.utilizacaoTempo > 70
                                      ? 'bg-orange-400'
                                      : 'bg-blue-400'
                                }`}
                                style={{ width: `${Math.min(tanqueProducao.utilizacaoTempo, 100)}%` }}
                              />
                            </div>
                          )}

                          {/* Ordens do tanque */}
                          {tanqueProducao.ordens.length > 0 && (
                            <div className="space-y-1">
                              {tanqueProducao.ordens.map((ordem) => (
                                <div
                                  key={ordem.id}
                                  className="text-xs bg-white rounded px-2 py-1 border border-slate-200 flex items-center justify-between group"
                                >
                                  <span className="truncate">{ordem.numero_externo || `Ordem ${ordem.id?.slice(0, 8)}`}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDesagendar(ordem.id)
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition-all"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Espaço disponível */}
                          <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                            <div>
                              Vol: {Math.max(0, tanqueProducao.tanque.volume_liters - (tanqueProducao.utilizacao / 100) * tanqueProducao.tanque.volume_liters).toLocaleString('pt-BR')}L livres
                            </div>
                            {tanqueProducao.duracaoTurnoMin > 0 && (
                              <div>
                                Tempo: {Math.max(0, tanqueProducao.duracaoTurnoMin - tanqueProducao.minutosUsados)}min livres de {tanqueProducao.duracaoTurnoMin}min
                              </div>
                            )}
                          </div>
                        </button>
                          )
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
