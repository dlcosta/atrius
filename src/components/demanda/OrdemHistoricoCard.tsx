'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Clock, Calendar, Zap, CheckCircle2, XCircle, ChevronDown,
  ChevronUp, Package, Layers, History, AlertTriangle,
} from 'lucide-react'
import type { AuditLog, OrdemHistorico, PlanningStatus } from '@/types'
import { ProducaoTimeline } from './ProducaoTimeline'

type Props = {
  ordem: OrdemHistorico
  auditLogs: AuditLog[]
  expandido: boolean
  carregandoAudit: boolean
  onToggle: () => void
}

type StatusConfig = {
  label: string
  badge: string
  icone: React.ElementType
  dot: string
}

const STATUS_CONFIG: Record<PlanningStatus, StatusConfig> = {
  BACKLOG:       { label: 'Backlog',      badge: 'bg-slate-100 text-slate-600 border border-slate-200',       icone: Clock,         dot: 'bg-slate-400' },
  SCHEDULED:     { label: 'Agendada',     badge: 'bg-blue-100 text-blue-700 border border-blue-200',          icone: Calendar,      dot: 'bg-blue-500' },
  IN_PRODUCTION: { label: 'Em Produção',  badge: 'bg-amber-100 text-amber-700 border border-amber-200',       icone: Zap,           dot: 'bg-amber-500' },
  COMPLETED:     { label: 'Concluída',    badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200', icone: CheckCircle2,  dot: 'bg-emerald-500' },
  CANCELED:      { label: 'Cancelada',    badge: 'bg-red-100 text-red-600 border border-red-200',             icone: XCircle,       dot: 'bg-red-500' },
}

function fmtMin(m: number | null | undefined): string {
  if (!m) return '—'
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h${min > 0 ? String(min).padStart(2, '0') : ''}` : `${min}min`
}

function BarraTempo({ producao, limpeza, total }: { producao?: number | null; limpeza?: number | null; total?: number | null }) {
  if (!total || total <= 0) return null
  const pct = producao && total ? Math.min((producao / total) * 100, 100) : 0
  const pctLimpeza = limpeza && total ? Math.min((limpeza / total) * 100, 100) : 0

  return (
    <div className="mt-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 w-full">
        <div className="bg-blue-400 transition-all" style={{ width: `${pct}%` }} title={`Produção: ${fmtMin(producao)}`} />
        <div className="bg-slate-300 transition-all" style={{ width: `${pctLimpeza}%` }} title={`Limpeza: ${fmtMin(limpeza)}`} />
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-400 inline-block" />Produção: {fmtMin(producao)}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-300 inline-block" />Limpeza: {fmtMin(limpeza)}</span>
        <span className="font-semibold text-slate-700">Total: {fmtMin(total)}</span>
      </div>
    </div>
  )
}

export function OrdemHistoricoCard({ ordem, auditLogs, expandido, carregandoAudit, onToggle }: Props) {
  const statusKey = (ordem.planning_status ?? 'BACKLOG') as PlanningStatus
  const cfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.BACKLOG
  const StatusIcone = cfg.icone

  const agendamentoPrincipal = ordem.agendamentos?.[0]
  const dataAgendamento = agendamentoPrincipal?.data_agendamento
  const turnoNome = agendamentoPrincipal?.turno_nome
  const tankNome = (agendamentoPrincipal as any)?.tank_nome

  const alertas = []
  if (statusKey === 'BACKLOG') alertas.push('Aguardando agendamento')
  if (statusKey === 'SCHEDULED' && dataAgendamento) {
    const hoje = new Date().toISOString().slice(0, 10)
    if (dataAgendamento < hoje) alertas.push('Data de produção passou')
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
      expandido ? 'border-blue-300 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow'
    }`}>
      {/* Cabeçalho do card */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Dot de status */}
          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />

          <div className="flex-1 min-w-0">
            {/* Linha 1: nome + badge de status */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 text-sm truncate">
                {ordem.numero_externo || `Ordem ${ordem.id.slice(0, 8)}`}
              </h3>
              <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                <StatusIcone size={11} />
                {cfg.label}
              </span>
            </div>

            {/* Linha 2: categoria + tanque + turno */}
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
              {ordem.tanque && (
                <span className="flex items-center gap-1">
                  <Layers size={11} />
                  {ordem.tanque}
                </span>
              )}
              {tankNome && (
                <>
                  <span className="text-slate-300">•</span>
                  <span>{tankNome}</span>
                </>
              )}
              {turnoNome && (
                <>
                  <span className="text-slate-300">•</span>
                  <span>{turnoNome}</span>
                </>
              )}
              {dataAgendamento && (
                <>
                  <span className="text-slate-300">•</span>
                  <span>{format(parseISO(dataAgendamento), 'dd/MM/yyyy', { locale: ptBR })}</span>
                </>
              )}
            </div>

            {/* Barra de tempo */}
            <BarraTempo
              producao={ordem.production_time_minutes}
              limpeza={ordem.cleaning_time_minutes}
              total={ordem.total_duration_minutes}
            />

            {/* Alertas */}
            {alertas.length > 0 && (
              <div className="flex items-center gap-1 mt-2 text-xs text-amber-600">
                <AlertTriangle size={11} />
                {alertas.join(' · ')}
              </div>
            )}

            {/* Linha 3: pedidos vinculados + contagem de logs + botão expandir */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Package size={11} />
                  {ordem.pedidos_vinculados?.length ?? 0} pedido{ordem.pedidos_vinculados?.length !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1">
                  <History size={11} />
                  {ordem.audit_count} evento{ordem.audit_count !== 1 ? 's' : ''}
                </span>
                <span className="font-semibold text-slate-700">
                  {(ordem.quantidade ?? 0).toLocaleString('pt-BR')}L
                </span>
              </div>
              <button
                onClick={onToggle}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold transition-colors"
              >
                {expandido ? <><ChevronUp size={14} />Fechar</> : <><ChevronDown size={14} />Detalhes</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Painel expandido */}
      {expandido && (
        <div className="border-t border-slate-100 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            {/* Pedidos vinculados */}
            <div className="p-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1">
                <Package size={12} />
                Pedidos vinculados
              </h4>
              {ordem.pedidos_vinculados?.length > 0 ? (
                <div className="space-y-2">
                  {ordem.pedidos_vinculados.map((p) => (
                    <div key={p.id} className="bg-white rounded-lg p-2.5 border border-slate-200 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">Pedido {p.numero_pedido}</span>
                        <span className="text-blue-600 font-bold">{p.total_litros.toLocaleString('pt-BR')}L</span>
                      </div>
                      <p className="text-slate-500 mt-0.5 truncate">{p.produto_descricao}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Nenhum pedido vinculado</p>
              )}

              {/* Detalhes de execução */}
              {agendamentoPrincipal && (
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Clock size={12} />
                    Execução
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {agendamentoPrincipal.data_inicio && (
                      <div className="bg-white rounded p-2 border border-slate-200">
                        <p className="text-slate-400">Início real</p>
                        <p className="font-semibold text-slate-800">
                          {format(parseISO(agendamentoPrincipal.data_inicio), 'dd/MM HH:mm', { locale: ptBR })}
                        </p>
                      </div>
                    )}
                    {agendamentoPrincipal.data_conclusao && (
                      <div className="bg-white rounded p-2 border border-slate-200">
                        <p className="text-slate-400">Conclusão</p>
                        <p className="font-semibold text-emerald-700">
                          {format(parseISO(agendamentoPrincipal.data_conclusao), 'dd/MM HH:mm', { locale: ptBR })}
                        </p>
                      </div>
                    )}
                    {agendamentoPrincipal.data_pausa && (
                      <div className="bg-white rounded p-2 border border-slate-200 col-span-2">
                        <p className="text-slate-400">Pausado em</p>
                        <p className="font-semibold text-amber-700">
                          {format(parseISO(agendamentoPrincipal.data_pausa), 'dd/MM HH:mm', { locale: ptBR })}
                        </p>
                        {(agendamentoPrincipal as any).observacao_pausa && (
                          <p className="text-slate-500 mt-0.5 italic">{(agendamentoPrincipal as any).observacao_pausa}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className="p-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1">
                <History size={12} />
                Linha do tempo operacional
              </h4>
              <ProducaoTimeline logs={auditLogs} carregando={carregandoAudit} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
