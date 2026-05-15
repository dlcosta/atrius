'use client'

import { useState, useMemo } from 'react'
import { format, addDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react'
import type { Ordem, Tanque } from '@/types'
import { OrdemSelector } from './OrdemSelector'

type Props = {
  ordens: Ordem[]
  tanques: Tanque[]
}

type Turno = {
  id: string
  nome: string
  horaInicio: number
  horaFim: number
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
}

const TURNOS_PADRAO: Turno[] = [
  { id: 'manha', nome: 'Manhã', horaInicio: 6, horaFim: 14 },
  { id: 'tarde', nome: 'Tarde', horaInicio: 14, horaFim: 22 },
]

export function ProducaoCalendar({ ordens, tanques }: Props) {
  const [diaBase, setDiaBase] = useState(new Date())
  const [turnos, setTurnos] = useState<Turno[]>(TURNOS_PADRAO)
  const [ordemSelecionada, setOrdemSelecionada] = useState<Ordem | null>(null)
  const [agendamentos, setAgendamentos] = useState<Map<string, { turnoId: string; tanqueId: string }>>(new Map())

  // Ordens BACKLOG disponíveis
  const ordensBacklog = useMemo(() => {
    return ordens.filter((o) => o.planning_status === 'BACKLOG')
  }, [ordens])

  // Gerar 7 dias a partir de hoje
  const dias = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const data = addDays(diaBase, i)
      return format(data, 'yyyy-MM-dd')
    })
  }, [diaBase])

  // Construir calendário com agendamentos
  const calendario = useMemo(() => {
    return dias.map((data) => ({
      data,
      turnos: turnos.map((turno) => ({
        turno,
        tanques: tanques.map((tanque) => {
          const ordensDoTanque = ordensBacklog.filter((o) => {
            const agendamento = agendamentos.get(o.id)
            return (
              agendamento?.turnoId === turno.id &&
              agendamento?.tanqueId === tanque.id &&
              o.data_prevista?.slice(0, 10) === data
            )
          })

          const utilizacao = ordensDoTanque.reduce((acc, o) => acc + (o.quantidade ?? 0), 0)
          const percentual = tanque.volume_liters > 0 ? (utilizacao / tanque.volume_liters) * 100 : 0

          return {
            tanque,
            ordens: ordensDoTanque,
            utilizacao: percentual,
          }
        }),
      })),
    }))
  }, [dias, turnos, tanques, ordensBacklog, agendamentos])

  function handleAgendar(ordem: Ordem, data: string, turnoId: string, tanqueId: string) {
    const novoAgendamento = new Map(agendamentos)
    novoAgendamento.set(ordem.id, { turnoId, tanqueId })
    setAgendamentos(novoAgendamento)
    setOrdemSelecionada(null)
  }

  function handleDesagendar(ordemId: string) {
    const novoAgendamento = new Map(agendamentos)
    novoAgendamento.delete(ordemId)
    setAgendamentos(novoAgendamento)
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Coluna esquerda: Ordens BACKLOG */}
        <div className="bg-white rounded-lg shadow p-4 h-fit">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Ordens BACKLOG ({ordensBacklog.length})</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {ordensBacklog.map((ordem) => {
              const agendada = agendamentos.has(ordem.id)
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
                        {turnoProducao.turno.horaInicio}h - {turnoProducao.turno.horaFim}h
                      </span>
                    </div>

                    {/* Tanques do turno */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {turnoProducao.tanques.map((tanqueProducao) => (
                        <div
                          key={tanqueProducao.tanque.id}
                          onClick={() => {
                            if (ordemSelecionada) {
                              handleAgendar(
                                ordemSelecionada,
                                dia.data,
                                turnoProducao.turno.id,
                                tanqueProducao.tanque.id
                              )
                            }
                          }}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            ordemSelecionada
                              ? 'border-dashed border-blue-400 bg-blue-25 cursor-pointer hover:bg-blue-50'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-sm text-slate-900">
                              {tanqueProducao.tanque.nome}
                            </span>
                            <span className="text-xs font-semibold text-slate-600">
                              {tanqueProducao.utilizacao.toFixed(0)}%
                            </span>
                          </div>

                          {/* Barra de progresso */}
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
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
                          <div className="text-xs text-slate-600 mt-2">
                            {tanqueProducao.tanque.volume_liters.toLocaleString('pt-BR')}L • Livre:{' '}
                            {Math.max(
                              0,
                              tanqueProducao.tanque.volume_liters - (tanqueProducao.utilizacao / 100) * tanqueProducao.tanque.volume_liters
                            ).toLocaleString('pt-BR')}
                            L
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de seleção */}
      {ordemSelecionada && (
        <OrdemSelector
          ordem={ordemSelecionada}
          onCancel={() => setOrdemSelecionada(null)}
        />
      )}
    </div>
  )
}
