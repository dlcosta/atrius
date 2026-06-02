'use client'

import { apiUrl } from '@/lib/api'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Factory,
  Gauge,
  Layers3,
  ListChecks,
  PauseCircle,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { Maquina, Ordem } from '@/types'
import {
  calcularDesempenhoMaquinas,
  calcularDesempenhoOperadores,
  calcularIndicadores,
  calcularMediaTempoPorProduto,
  calcularTempoRestanteMs,
  formatarDuracaoRelogio,
  formatarMinutos,
  obterQuantidadeProduzidaEstimada,
  obterTempoProducaoMin,
  type EventoMonitoramento,
  type MachinePerformance,
  type OperatorPerformance,
} from '@/lib/monitoring/indicadores'
import { pertenceAoDia } from '@/lib/planning/datas-ordem'

const REFRESH_MS = 15000

async function readJsonSafe(response: Response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

type LiveResourceCard = {
  id: string
  nome: string
  tipo: 'maquina' | 'tanque'
  ordens: Ordem[]
  atual: Ordem | null
  proxima: Ordem | null
  volumeHoje: number
}

type Bottleneck = {
  id: string
  title: string
  detail: string
  meta: string
  severity: 'critical' | 'warning' | 'info'
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function formatarNumero(valor: number, digits = 1): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(valor)
}

function formatarDataHora(dataIso: string | null | undefined): string {
  if (!dataIso) return '--'
  return format(new Date(dataIso), 'dd/MM HH:mm', { locale: ptBR })
}

function formatarHora(dataIso: string | null | undefined): string {
  if (!dataIso) return '--:--'
  return format(new Date(dataIso), 'HH:mm')
}

function statusLabel(ordem: Ordem | null, agoraMs = Date.now()): string {
  if (!ordem) return 'Livre'
  if (isCanceledOrder(ordem)) return 'Cancelada'
  if (ordem.status === 'produzindo') return 'Produzindo'
  if (ordem.status === 'pausada') return 'Pausada'
  if (ordem.status === 'concluida') return 'Concluída'
  if (isExpiredUnstartedOrder(ordem, agoraMs)) return 'Vencida'
  if (ordem.planning_status === 'BACKLOG' || ordem.planning_status === 'READY_TO_SCHEDULE') return 'Não agendada'
  if (ordem.planning_status === 'WAITING_TANK') return 'Aguard. tanque'
  return 'Programada'
}

function statusTone(ordem: Ordem | null): 'green' | 'amber' | 'blue' | 'slate' {
  if (!ordem) return 'slate'
  if (isCanceledOrder(ordem)) return 'slate'
  if (ordem.status === 'produzindo') return 'green'
  if (ordem.status === 'pausada' || ordem.planning_status === 'WAITING_TANK') return 'amber'
  if (ordem.status === 'concluida') return 'slate'
  return 'blue'
}

function isCanceledOrder(ordem: Ordem): boolean {
  return ordem.status === 'cancelada' || ordem.planning_status === 'CANCELED'
}

function isExpiredUnstartedOrder(ordem: Ordem, agoraMs: number): boolean {
  if (ordem.status !== 'aguardando') return false
  if (ordem.inicio_operacao_em || ordem.fim_operacao_em) return false
  if (!ordem.fim_calculado) return false
  return new Date(ordem.fim_calculado).getTime() < agoraMs
}

function hasOperationalTrace(ordem: Ordem): boolean {
  return Boolean(ordem.inicio_agendado || ordem.inicio_operacao_em || ordem.fim_operacao_em || ordem.fim_calculado)
}

function isMonitoringOrder(ordem: Ordem, agoraMs: number): boolean {
  if (isCanceledOrder(ordem)) return false
  if (isExpiredUnstartedOrder(ordem, agoraMs)) return false
  if (ordem.planning_status === 'BACKLOG' || ordem.planning_status === 'READY_TO_SCHEDULE') {
    return hasOperationalTrace(ordem)
  }
  return true
}

function statusClasses(ordem: Ordem | null): string {
  const tone = statusTone(ordem)
  const map = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    slate: 'border-slate-200 bg-slate-100 text-slate-600',
  }
  return map[tone]
}

function getResourceOrder(ordens: Ordem[], agoraMs: number) {
  const ordenadas = [...ordens].sort((a, b) => {
    const aMs = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bMs = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    return aMs - bMs
  })

  const emProducao = ordenadas.find((ordem) => ordem.status === 'produzindo')
  const pausada = ordenadas.find((ordem) => ordem.status === 'pausada')
  const naFaixa = ordenadas.find((ordem) => {
    if (!ordem.inicio_agendado || !ordem.fim_calculado) return false
    const inicioMs = new Date(ordem.inicio_agendado).getTime()
    const fimMs = new Date(ordem.fim_calculado).getTime()
    return inicioMs <= agoraMs && fimMs > agoraMs
  })

  const atual = emProducao ?? pausada ?? naFaixa ?? null
  const proxima =
    ordenadas.find((ordem) => {
      if (!ordem.inicio_agendado) return false
      if (atual && ordem.id === atual.id) return false
      return new Date(ordem.inicio_agendado).getTime() > agoraMs
    }) ?? null

  return { atual, proxima }
}

function getResourceVolumeHoje(ordens: Ordem[], agoraMs: number) {
  return ordens.reduce((acc, ordem) => acc + obterQuantidadeProduzidaEstimada(ordem, agoraMs), 0)
}

function getMachineName(ordem: Ordem) {
  return ordem.maquina?.nome ?? (ordem.maquina_id ? `Máquina ${ordem.maquina_id.slice(0, 4)}` : '--')
}

function getTankName(ordem: Ordem, index = 0) {
  return ordem.tanque_ref?.nome ?? ordem.tanque ?? `Tanque ${index + 1}`
}

function getHistoryResource(ordem: Ordem) {
  return ordem.etapa === 'envase' ? getMachineName(ordem) : getTankName(ordem)
}

function getOrderProduct(ordem: Ordem | null) {
  if (!ordem) return '--'
  return ordem.produto?.nome ?? ordem.produto_sku ?? '--'
}

function getResourceProgress(card: LiveResourceCard, agoraMs: number) {
  const atual = card.atual
  if (!atual?.inicio_operacao_em || !atual.fim_calculado) return 0
  const inicioMs = new Date(atual.inicio_operacao_em).getTime()
  const fimMs = new Date(atual.fim_calculado).getTime()
  if (!Number.isFinite(inicioMs) || !Number.isFinite(fimMs) || fimMs <= inicioMs) return 0
  return clampPercent(((agoraMs - inicioMs) / (fimMs - inicioMs)) * 100)
}

function getProductionHealth(params: {
  onTimeRate: number
  utilizationRate: number
  delayCount: number
  pauseMinutes: number
  activeResources: number
}) {
  const delayPenalty = Math.min(24, params.delayCount * 7)
  const pausePenalty = Math.min(18, params.pauseMinutes / 30)
  const idleBonus = Math.min(8, params.activeResources * 2)
  const score = Math.round(
    clampPercent(params.onTimeRate * 0.45 + params.utilizationRate * 0.35 + 20 + idleBonus - delayPenalty - pausePenalty)
  )

  if (score >= 82) return { score, label: 'Operação saudável', tone: 'green' as const }
  if (score >= 62) return { score, label: 'Atenção controlada', tone: 'amber' as const }
  return { score, label: 'Risco operacional', tone: 'red' as const }
}

function buildBottlenecks(params: {
  delayedOrders: Ordem[]
  waitingTank: Ordem[]
  desempenhoMaquinas: MachinePerformance[]
  desempenhoOperadores: OperatorPerformance[]
  pausasPeriodoMin: number
}): Bottleneck[] {
  const bottlenecks: Bottleneck[] = []
  const weakMachine = params.desempenhoMaquinas.find((maquina) => maquina.totalOrders > 0 && maquina.utilizationRate < 40)
  const highPauseMachine = params.desempenhoMaquinas.find((maquina) => maquina.pauseMinutes >= 30)
  const operatorWithPauses = params.desempenhoOperadores.find((operador) => operador.pauseEvents > 0)

  if (params.delayedOrders.length > 0) {
    bottlenecks.push({
      id: 'delayed',
      title: `${params.delayedOrders.length} ordem(ns) com atraso aberto`,
      detail: `Primeira: #${params.delayedOrders[0].numero_externo} em ${getHistoryResource(params.delayedOrders[0])}`,
      meta: 'Fim previsto já passou',
      severity: 'critical',
    })
  }

  if (params.waitingTank.length > 0) {
    bottlenecks.push({
      id: 'waiting-tank',
      title: `${params.waitingTank.length} envase(s) aguardando tanque`,
      detail: `Próxima liberação: #${params.waitingTank[0].numero_externo}`,
      meta: 'Dependência entre etapas',
      severity: 'warning',
    })
  }

  if (highPauseMachine) {
    bottlenecks.push({
      id: `pause-${highPauseMachine.machineId}`,
      title: `${highPauseMachine.machineName} concentra paradas`,
      detail: `${formatarMinutos(highPauseMachine.pauseMinutes)} parado no período`,
      meta: 'Revisar motivo das pausas',
      severity: 'warning',
    })
  } else if (params.pausasPeriodoMin > 0) {
    bottlenecks.push({
      id: 'pause-period',
      title: 'Pausas registradas no período',
      detail: `${formatarMinutos(params.pausasPeriodoMin)} somados em eventos`,
      meta: 'Acompanhar recorrência',
      severity: 'info',
    })
  }

  if (weakMachine) {
    bottlenecks.push({
      id: `util-${weakMachine.machineId}`,
      title: `${weakMachine.machineName} com baixa ocupação`,
      detail: `${formatarNumero(weakMachine.utilizationRate)}% de utilização`,
      meta: 'Checar fila ou disponibilidade',
      severity: 'info',
    })
  }

  if (operatorWithPauses) {
    bottlenecks.push({
      id: `op-${operatorWithPauses.operatorName}`,
      title: `${operatorWithPauses.operatorName} teve pausas no ciclo`,
      detail: `${operatorWithPauses.pauseEvents} evento(s), ${formatarMinutos(operatorWithPauses.pauseMinutes)}`,
      meta: 'Sinal de acompanhamento',
      severity: 'info',
    })
  }

  return bottlenecks.slice(0, 4)
}

function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-[26px] border border-[#DDE3DD] bg-white/88 shadow-[0_20px_55px_rgba(36,45,38,0.07)] backdrop-blur ${className}`}>
      {children}
    </section>
  )
}

function SectionHeader({
  label,
  title,
  description,
  action,
}: {
  label: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#7A8478]">{label}</div>
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-[#151A16]">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6D756C]">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'slate',
}: {
  title: string
  value: string
  detail: string
  icon: typeof Activity
  tone?: 'slate' | 'green' | 'amber' | 'blue'
}) {
  const toneMap = {
    slate: 'from-[#F8F6EF] to-white text-[#171A16] border-[#E3DED0]',
    green: 'from-[#EDF8EF] to-white text-[#0B5B34] border-[#CFE8D5]',
    amber: 'from-[#FFF4DE] to-white text-[#8A4B00] border-[#F4DBAD]',
    blue: 'from-[#ECF5FF] to-white text-[#114C8C] border-[#CADFF5]',
  }

  return (
    <div className={`rounded-[22px] border bg-gradient-to-br p-4 ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7A8478]">{title}</p>
          <p className="mt-2 truncate text-[30px] font-semibold leading-none tracking-[-0.05em]">{value}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/80 p-2.5 text-current shadow-sm">
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-3 text-sm leading-5 text-[#687066]">{detail}</p>
    </div>
  )
}

function HealthGauge({
  score,
  label,
  tone,
}: {
  score: number
  label: string
  tone: 'green' | 'amber' | 'red'
}) {
  const toneClass = {
    green: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-rose-700',
  }[tone]

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[280px_1fr]">
      <div className="relative flex min-h-[230px] items-center justify-center rounded-[30px] border border-[#203123]/10 bg-[#101711] p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
        <div
          className="absolute inset-5 rounded-[26px] opacity-70"
          style={{
            background:
              'radial-gradient(circle at 48% 42%, rgba(74,222,128,0.24), transparent 34%), linear-gradient(150deg, rgba(255,255,255,0.08), transparent 62%)',
          }}
        />
        <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-[conic-gradient(#129957_var(--score),rgba(255,255,255,0.13)_0)] p-3" style={{ '--score': `${score}%` } as React.CSSProperties}>
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#101711] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
            <span className="text-[52px] font-semibold leading-none tracking-[-0.07em]">{score}</span>
            <span className="mt-1 text-xs uppercase tracking-[0.2em] text-white/54">de 100</span>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col justify-center">
        <div className={`text-sm font-bold uppercase tracking-[0.18em] ${toneClass}`}>{label}</div>
        <h2 className="mt-2 max-w-2xl text-[26px] font-semibold leading-[1.06] tracking-[-0.06em] text-[#151A16] sm:text-[34px]">
          Saúde da operação em uma leitura única.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#626A60]">
          O score combina prazo, utilização, recursos ativos, atrasos e paradas para mostrar se a rotina está fluindo ou se precisa de intervenção.
        </p>
        <div className="mt-5 grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-[#F3F0E7] px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#7A8478]">Fluxo</div>
            <div className="mt-1 text-sm font-semibold text-[#151A16]">Ao vivo</div>
          </div>
          <div className="rounded-2xl bg-[#F3F0E7] px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#7A8478]">Foco</div>
            <div className="mt-1 text-sm font-semibold text-[#151A16]">Gargalos</div>
          </div>
          <div className="rounded-2xl bg-[#F3F0E7] px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[#7A8478]">Base</div>
            <div className="mt-1 text-sm font-semibold text-[#151A16]">Histórico</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResourceRow({ card, agoraMs }: { card: LiveResourceCard; agoraMs: number }) {
  const restanteMs = card.atual ? calcularTempoRestanteMs(card.atual, agoraMs) : null
  const progress = getResourceProgress(card, agoraMs)
  const tone = statusTone(card.atual)
  const toneBar = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    blue: 'bg-blue-500',
    slate: 'bg-slate-300',
  }[tone]

  return (
    <article className="grid gap-4 rounded-[20px] border border-[#E3E7E0] bg-[#FCFBF7] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(38,45,35,0.08)] lg:grid-cols-[220px_1fr_160px]">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#111A12] text-white">
          {card.tipo === 'maquina' ? <Factory size={19} /> : <Layers3 size={19} />}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#828B80]">
            {card.tipo === 'maquina' ? 'Máquina' : 'Tanque'}
          </div>
          <h3 className="mt-1 truncate text-base font-semibold text-[#151A16]">{card.nome}</h3>
          <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(card.atual)}`}>
            {statusLabel(card.atual)}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[#151A16]">{getOrderProduct(card.atual)}</div>
            <div className="mt-0.5 text-xs text-[#778074]">
              {card.atual ? `#${card.atual.numero_externo} | ${card.atual.operador_nome ?? 'Operador não informado'}` : 'Sem ordem ativa neste momento'}
            </div>
          </div>
          <div className="text-right font-mono text-sm font-semibold text-[#151A16]">
            {restanteMs === null ? '--:--:--' : formatarDuracaoRelogio(restanteMs)}
          </div>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#E4E5DF]">
          <div className={`h-full rounded-full ${toneBar}`} style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-[#80887D]">
          <span>Início {formatarHora(card.atual?.inicio_operacao_em ?? card.atual?.inicio_agendado)}</span>
          <span>{formatarNumero(progress, 0)}% do ciclo</span>
          <span>Fim {formatarHora(card.atual?.fim_calculado)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <div className="rounded-2xl border border-[#E4E6DD] bg-white px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#828B80]">Hoje</div>
          <div className="mt-1 text-sm font-semibold text-[#151A16]">{card.ordens.length} ordens</div>
        </div>
        <div className="rounded-2xl border border-[#E4E6DD] bg-white px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#828B80]">Próxima</div>
          <div className="mt-1 truncate text-sm font-semibold text-[#151A16]">
            {card.proxima ? `#${card.proxima.numero_externo} ${formatarHora(card.proxima.inicio_agendado)}` : 'Sem fila'}
          </div>
        </div>
      </div>
    </article>
  )
}

function BottleneckList({ items }: { items: Bottleneck[] }) {
  const iconMap = {
    critical: 'border-rose-200 bg-rose-50 text-rose-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="group flex gap-3 rounded-[18px] border border-[#E1E5DC] bg-[#FCFBF7] p-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${iconMap[item.severity]}`}>
            {item.severity === 'info' ? <Clock3 size={17} /> : <AlertTriangle size={17} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[#151A16]">{item.title}</div>
            <div className="mt-1 text-xs leading-5 text-[#626A60]">{item.detail}</div>
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8B9387]">{item.meta}</div>
          </div>
          <ChevronRight className="mt-2 text-[#A4AB9F] transition group-hover:translate-x-0.5" size={16} />
        </div>
      ))}

      {items.length === 0 && (
        <div className="rounded-[18px] border border-dashed border-[#DDE3DD] bg-[#FCFBF7] px-4 py-10 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={28} />
          <p className="mt-3 text-sm font-semibold text-[#151A16]">Sem gargalos relevantes agora.</p>
          <p className="mt-1 text-xs text-[#70786E]">Continue acompanhando atrasos, paradas e liberações de tanque.</p>
        </div>
      )}
    </div>
  )
}

function MachinePerformanceBars({ items }: { items: MachinePerformance[] }) {
  return (
    <div className="space-y-4">
      {items.slice(0, 6).map((maquina) => (
        <div key={maquina.machineId}>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="truncate font-semibold text-[#151A16]">{maquina.machineName}</div>
              <div className="text-xs text-[#737B71]">
                {maquina.completedOrders} concluídas | {formatarNumero(maquina.outputLiters, 1)} L
              </div>
            </div>
            <div className="font-mono text-sm font-semibold text-[#151A16]">{formatarNumero(maquina.utilizationRate)}%</div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#E2E4DD]">
            <div
              className={`h-full rounded-full ${maquina.utilizationRate >= 60 ? 'bg-emerald-500' : maquina.utilizationRate >= 35 ? 'bg-amber-500' : 'bg-slate-400'}`}
              style={{ width: `${clampPercent(maquina.utilizationRate)}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[#70786E]">
            <span>Prod. {formatarMinutos(maquina.actualMinutes)}</span>
            <span>Pausa {formatarMinutos(maquina.pauseMinutes)}</span>
            <span>Prazo {formatarNumero(maquina.onTimeRate)}%</span>
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="rounded-[18px] border border-dashed border-[#DDE3DD] px-4 py-8 text-center text-sm text-[#70786E]">
          Nenhuma máquina ativa no período.
        </div>
      )}
    </div>
  )
}

function OperatorRank({ items }: { items: OperatorPerformance[] }) {
  return (
    <div className="space-y-3">
      {items.slice(0, 5).map((operador, index) => (
        <div key={operador.operatorName} className="flex items-center gap-3 rounded-[18px] border border-[#E1E5DC] bg-[#FCFBF7] p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#141B14] text-sm font-semibold text-white">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[#151A16]">{operador.operatorName}</div>
            <div className="mt-1 text-xs text-[#737B71]">
              {operador.completedOrders} concluídas | {formatarNumero(operador.outputLiters, 1)} L
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg font-semibold text-emerald-700">{formatarNumero(operador.onTimeRate)}%</div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-[#80887D]">no prazo</div>
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="rounded-[18px] border border-dashed border-[#DDE3DD] px-4 py-8 text-center text-sm text-[#70786E]">
          Ainda não há operadores com dados suficientes.
        </div>
      )}
    </div>
  )
}

function MonitoramentoSkeleton() {
  return (
    <div className="min-h-full w-full max-w-full overflow-hidden bg-[#F7F8FA] text-[#151A16]">
      <div className="relative mx-auto flex w-full max-w-full min-w-0 flex-col gap-5 py-5 pl-4 pr-8 sm:px-6 lg:max-w-[1540px] lg:px-8">
        <div className="rounded-[30px] border border-[#E4E7EC] bg-white px-5 py-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
          <div className="h-5 w-40 rounded-full bg-[#E6E2D7]" />
          <div className="mt-5 h-10 max-w-xl rounded-2xl bg-[#DEDACF]" />
          <div className="mt-3 h-4 max-w-2xl rounded-full bg-[#E6E2D7]" />
        </div>

        <div className="rounded-[26px] border border-[#DDE3DD] bg-white/88 p-5 shadow-[0_20px_55px_rgba(36,45,38,0.07)]">
          <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
              <div className="min-h-[230px] rounded-[30px] bg-[#101711]" />
              <div className="space-y-3">
                <div className="h-4 w-36 rounded-full bg-[#E6E2D7]" />
                <div className="h-20 max-w-lg rounded-3xl bg-[#DEDACF]" />
                <div className="h-16 max-w-xl rounded-3xl bg-[#E6E2D7]" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-36 rounded-[22px] border border-[#E3DED0] bg-[#F8F6EF]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MonitoramentoPage() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) return <MonitoramentoSkeleton />

  return <MonitoramentoDashboard />
}

function MonitoramentoDashboard() {
  const hoje = useMemo(() => new Date(), [])
  const hojeYmd = useMemo(() => format(hoje, 'yyyy-MM-dd'), [hoje])
  const [periodStart, setPeriodStart] = useState(() => format(subDays(hoje, 6), 'yyyy-MM-dd'))
  const [periodEnd, setPeriodEnd] = useState(() => hojeYmd)
  const [agoraMs, setAgoraMs] = useState<number>(Date.now())
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [ordensHoje, setOrdensHoje] = useState<Ordem[]>([])
  const [ordensPeriodo, setOrdensPeriodo] = useState<Ordem[]>([])
  const [eventosPeriodo, setEventosPeriodo] = useState<EventoMonitoramento[]>([])
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      setErro('')
      const [mRes, hojeRes, periodoRes, eventosRes] = await Promise.all([
        fetch(apiUrl('/api/maquinas')),
        fetch(apiUrl(`/api/ordens?data=${hojeYmd}`)),
        fetch(apiUrl(`/api/ordens?inicio=${periodStart}&fim=${periodEnd}`)),
        fetch(apiUrl(`/api/monitoramento/eventos?inicio=${periodStart}&fim=${periodEnd}`)),
      ])

      const [mData, hojeData, periodoData, eventosData] = await Promise.all([
        readJsonSafe(mRes),
        readJsonSafe(hojeRes),
        readJsonSafe(periodoRes),
        readJsonSafe(eventosRes),
      ])

      if (!mRes.ok) throw new Error((mData as { error?: string } | null)?.error ?? 'Erro ao carregar máquinas')
      if (!hojeRes.ok) throw new Error((hojeData as { error?: string } | null)?.error ?? 'Erro ao carregar ordens do dia')
      if (!periodoRes.ok) throw new Error((periodoData as { error?: string } | null)?.error ?? 'Erro ao carregar ordens do período')
      if (!eventosRes.ok) throw new Error((eventosData as { error?: string } | null)?.error ?? 'Erro ao carregar eventos do período')

      setMaquinas(Array.isArray(mData) ? mData : [])
      setOrdensHoje(Array.isArray(hojeData) ? hojeData : [])
      setOrdensPeriodo(Array.isArray(periodoData) ? periodoData : [])
      setEventosPeriodo(Array.isArray(eventosData) ? eventosData : [])
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Erro ao carregar monitoramento')
    } finally {
      setCarregando(false)
    }
  }, [hojeYmd, periodEnd, periodStart])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  useEffect(() => {
    const timer = setInterval(carregarDados, REFRESH_MS)
    return () => clearInterval(timer)
  }, [carregarDados])

  useEffect(() => {
    const clock = setInterval(() => setAgoraMs(Date.now()), 1000)
    return () => clearInterval(clock)
  }, [])

  const rangeStartMs = useMemo(() => new Date(`${periodStart}T00:00:00`).getTime(), [periodStart])
  const rangeEndMs = useMemo(() => new Date(`${periodEnd}T23:59:59.999`).getTime(), [periodEnd])

  const maquinasAtivas = useMemo(() => maquinas.filter((maquina) => maquina.ativa), [maquinas])

  const ordensHojeValidas = useMemo(
    () => ordensHoje.filter((ordem) => isMonitoringOrder(ordem, agoraMs)).filter((ordem) => pertenceAoDia(ordem, hojeYmd)),
    [ordensHoje, hojeYmd, agoraMs]
  )

  const ordensPeriodoValidas = useMemo(
    () => ordensPeriodo.filter((ordem) => isMonitoringOrder(ordem, agoraMs)),
    [ordensPeriodo, agoraMs]
  )

  const indicadoresPeriodo = useMemo(
    () => calcularIndicadores(ordensPeriodoValidas, maquinasAtivas.length, agoraMs),
    [ordensPeriodoValidas, maquinasAtivas.length, agoraMs]
  )

  const desempenhoMaquinas = useMemo(
    () =>
      calcularDesempenhoMaquinas({
        ordens: ordensPeriodoValidas,
        eventos: eventosPeriodo,
        maquinas,
        rangeStartMs,
        rangeEndMs,
        agoraMs,
      }),
    [ordensPeriodoValidas, eventosPeriodo, maquinas, rangeStartMs, rangeEndMs, agoraMs]
  )

  const desempenhoOperadores = useMemo(
    () =>
      calcularDesempenhoOperadores({
        ordens: ordensPeriodoValidas,
        eventos: eventosPeriodo,
        agoraMs,
      }),
    [ordensPeriodoValidas, eventosPeriodo, agoraMs]
  )

  const mediasProduto = useMemo(() => calcularMediaTempoPorProduto(ordensPeriodoValidas), [ordensPeriodoValidas])

  const liveMachineCards = useMemo<LiveResourceCard[]>(() => {
    return maquinasAtivas.map((maquina) => {
      const ordensRecurso = ordensHojeValidas.filter((ordem) => ordem.etapa === 'envase' && ordem.maquina_id === maquina.id)
      const { atual, proxima } = getResourceOrder(ordensRecurso, agoraMs)
      return {
        id: maquina.id,
        nome: maquina.nome,
        tipo: 'maquina',
        ordens: ordensRecurso,
        atual,
        proxima,
        volumeHoje: getResourceVolumeHoje(ordensRecurso, agoraMs),
      }
    })
  }, [maquinasAtivas, ordensHojeValidas, agoraMs])

  const liveTankCards = useMemo<LiveResourceCard[]>(() => {
    const grouped = new Map<string, Ordem[]>()

    for (const ordem of ordensHojeValidas.filter((item) => item.etapa === 'tanque')) {
      const key = ordem.tank_id ?? ordem.tanque ?? ordem.id
      const lista = grouped.get(key) ?? []
      lista.push(ordem)
      grouped.set(key, lista)
    }

    return Array.from(grouped.entries()).map(([key, lista], index) => {
      const { atual, proxima } = getResourceOrder(lista, agoraMs)
      return {
        id: key,
        nome: getTankName(lista[0], index),
        tipo: 'tanque',
        ordens: lista,
        atual,
        proxima,
        volumeHoje: getResourceVolumeHoje(lista, agoraMs),
      }
    })
  }, [ordensHojeValidas, agoraMs])

  const liveCards = useMemo(() => [...liveMachineCards, ...liveTankCards], [liveMachineCards, liveTankCards])

  const historyRows = useMemo(() => {
    return [...ordensPeriodoValidas].sort((a, b) => {
      const aMs =
        new Date(a.fim_operacao_em ?? a.inicio_operacao_em ?? a.inicio_agendado ?? a.sincronizado_em).getTime()
      const bMs =
        new Date(b.fim_operacao_em ?? b.inicio_operacao_em ?? b.inicio_agendado ?? b.sincronizado_em).getTime()
      return bMs - aMs
    })
  }, [ordensPeriodoValidas])

  const litrosPeriodo = useMemo(
    () => ordensPeriodoValidas.reduce((acc, ordem) => acc + obterQuantidadeProduzidaEstimada(ordem, agoraMs), 0),
    [ordensPeriodoValidas, agoraMs]
  )

  const pausasPeriodoMin = useMemo(
    () => desempenhoMaquinas.reduce((acc, maquina) => acc + maquina.pauseMinutes, 0),
    [desempenhoMaquinas]
  )

  const utilizacaoMedia = useMemo(() => {
    if (desempenhoMaquinas.length === 0) return 0
    return desempenhoMaquinas.reduce((acc, maquina) => acc + maquina.utilizationRate, 0) / desempenhoMaquinas.length
  }, [desempenhoMaquinas])

  const operadoresAtivosHoje = useMemo(() => {
    return new Set(
      ordensHojeValidas
        .filter((ordem) => ordem.status === 'produzindo' || ordem.status === 'pausada')
        .map((ordem) => ordem.operador_nome)
        .filter(Boolean)
    ).size
  }, [ordensHojeValidas])

  const ordensAtrasadas = useMemo(
    () =>
      ordensPeriodoValidas.filter((ordem) => {
        if (ordem.status === 'concluida' || isCanceledOrder(ordem)) return false
        if (!ordem.fim_calculado) return false
        return new Date(ordem.fim_calculado).getTime() < agoraMs
      }),
    [ordensPeriodoValidas, agoraMs]
  )

  const aguardandoTanque = useMemo(
    () => ordensPeriodoValidas.filter((ordem) => ordem.planning_status === 'WAITING_TANK'),
    [ordensPeriodoValidas]
  )

  const onTimeRate = useMemo(() => {
    if (desempenhoMaquinas.length === 0) return 0
    const totalConcluidas = desempenhoMaquinas.reduce((acc, maquina) => acc + maquina.completedOrders, 0)
    if (totalConcluidas === 0) return 0
    return (
      desempenhoMaquinas.reduce((acc, maquina) => acc + maquina.onTimeRate * maquina.completedOrders, 0) /
      totalConcluidas
    )
  }, [desempenhoMaquinas])

  const activeResources = liveCards.filter((card) => card.atual?.status === 'produzindo').length

  const health = useMemo(
    () =>
      getProductionHealth({
        onTimeRate,
        utilizationRate: utilizacaoMedia,
        delayCount: ordensAtrasadas.length,
        pauseMinutes: pausasPeriodoMin,
        activeResources,
      }),
    [onTimeRate, utilizacaoMedia, ordensAtrasadas.length, pausasPeriodoMin, activeResources]
  )

  const bottlenecks = useMemo(
    () =>
      buildBottlenecks({
        delayedOrders: ordensAtrasadas,
        waitingTank: aguardandoTanque,
        desempenhoMaquinas,
        desempenhoOperadores,
        pausasPeriodoMin,
      }),
    [ordensAtrasadas, aguardandoTanque, desempenhoMaquinas, desempenhoOperadores, pausasPeriodoMin]
  )

  function aplicarPreset(dias: number) {
    const fim = format(new Date(), 'yyyy-MM-dd')
    const inicio = format(subDays(new Date(), dias - 1), 'yyyy-MM-dd')
    setPeriodStart(inicio)
    setPeriodEnd(fim)
  }

  return (
    <div className="min-h-full w-full max-w-full overflow-hidden bg-[#F7F8FA] text-[#151A16]">
      <div className="relative mx-auto flex w-full max-w-full min-w-0 flex-col gap-5 py-5 pl-4 pr-8 sm:px-6 lg:max-w-[1540px] lg:px-8">
        <header className="rounded-[30px] border border-[#E4E7EC] bg-white px-5 py-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
          <div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.16)]" />
                  Ao vivo
                </span>
                <span className="text-xs font-medium text-[#6F776C]">
                  Atualiza a cada {REFRESH_MS / 1000}s | {format(new Date(agoraMs), 'HH:mm:ss')}
                </span>
              </div>
              <h1 className="mt-3 max-w-full break-words text-[30px] font-semibold leading-none tracking-[-0.07em] text-[#111511] sm:text-[44px]">
                Monitoramento operacional
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#626A60]">
                Uma leitura clara do que está rodando agora, onde a operação pode travar e como o período está performando.
              </p>
            </div>

            <div className="grid min-w-0 gap-2 sm:grid-cols-[auto_auto_auto_auto]">
              <div className="rounded-2xl border border-[#DBDED3] bg-white px-3 py-2">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7A8478]">
                  <CalendarRange size={13} />
                  Início
                </label>
                <input
                  type="date"
                  value={periodStart}
                  max={periodEnd}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="mt-1 w-full bg-transparent text-sm font-semibold text-[#151A16] outline-none"
                />
              </div>
              <div className="rounded-2xl border border-[#DBDED3] bg-white px-3 py-2">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7A8478]">
                  <CalendarRange size={13} />
                  Fim
                </label>
                <input
                  type="date"
                  value={periodEnd}
                  min={periodStart}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="mt-1 w-full bg-transparent text-sm font-semibold text-[#151A16] outline-none"
                />
              </div>
              <button
                onClick={() => aplicarPreset(7)}
                className="rounded-2xl border border-[#DBDED3] bg-white px-4 py-3 text-sm font-semibold text-[#485044] hover:bg-[#F4F2EA]"
              >
                7 dias
              </button>
              <button
                onClick={carregarDados}
                disabled={carregando}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#111A12] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(17,26,18,0.18)] hover:bg-[#203024] disabled:opacity-60"
              >
                <RefreshCw size={16} className={carregando ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>
          </div>
        </header>

        {erro && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-800">
            {erro}
          </div>
        )}

        <Panel className="p-4 sm:p-5">
          <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
            <HealthGauge score={health.score} label={health.label} tone={health.tone} />
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                title="Produção no período"
                value={`${formatarNumero(litrosPeriodo, 1)} L`}
                detail={`${formatarNumero(indicadoresPeriodo.percentualProduzido)}% do volume planejado estimado.`}
                icon={Factory}
                tone="green"
              />
              <MetricCard
                title="No prazo"
                value={`${formatarNumero(onTimeRate)}%`}
                detail={`${indicadoresPeriodo.ordensConcluidas} concluídas de ${indicadoresPeriodo.totalOrdens} ordens.`}
                icon={CheckCircle2}
                tone="green"
              />
              <MetricCard
                title="Paradas"
                value={formatarMinutos(pausasPeriodoMin)}
                detail="Tempo acumulado em pausa no recorte selecionado."
                icon={PauseCircle}
                tone={pausasPeriodoMin > 0 ? 'amber' : 'slate'}
              />
              <MetricCard
                title="Recursos ativos"
                value={`${activeResources}/${liveCards.length}`}
                detail={`${operadoresAtivosHoje} operador(es) tocando ordens hoje.`}
                icon={CircleGauge}
                tone="blue"
              />
            </div>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_420px]">
          <Panel className="p-4 sm:p-5">
            <SectionHeader
              label="Ao vivo"
              title="Recursos em operação"
              description="Máquinas e tanques aparecem como linhas de comando: status, produto, progresso, tempo restante e próxima ordem."
              action={
                <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <Activity size={13} />
                  {activeResources} produzindo
                </div>
              }
            />
            <div className="mt-5 space-y-3">
              {liveCards.map((card) => (
                <ResourceRow key={`${card.tipo}-${card.id}`} card={card} agoraMs={agoraMs} />
              ))}
              {liveCards.length === 0 && (
                <div className="rounded-[22px] border border-dashed border-[#DDE3DD] bg-[#FCFBF7] px-4 py-12 text-center text-sm text-[#70786E]">
                  Nenhum recurso configurado ou nenhuma ordem agendada para hoje.
                </div>
              )}
            </div>
          </Panel>

          <div className="grid gap-5">
            <Panel className="p-4 sm:p-5">
              <SectionHeader label="Gargalos" title="O que merece atenção" />
              <div className="mt-4">
                <BottleneckList items={bottlenecks} />
              </div>
            </Panel>

            <Panel className="p-4 sm:p-5">
              <SectionHeader label="Pessoas" title="Top operadores" description="Ranking por prazo e eficiência no período." />
              <div className="mt-4">
                <OperatorRank items={desempenhoOperadores} />
              </div>
            </Panel>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr_1.15fr]">
          <Panel className="p-4 sm:p-5">
            <SectionHeader label="Performance" title="Ocupação das máquinas" />
            <div className="mt-5">
              <MachinePerformanceBars items={desempenhoMaquinas} />
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <SectionHeader label="Produtos" title="Ciclos reais" description="Produtos com mais histórico aparecem primeiro." />
            <div className="mt-5 space-y-3">
              {mediasProduto.slice(0, 6).map((media) => (
                <div key={media.produtoSku} className="rounded-[18px] border border-[#E1E5DC] bg-[#FCFBF7] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#151A16]">{media.produtoNome}</div>
                      <div className="mt-1 text-xs text-[#737B71]">{media.produtoSku}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg font-semibold text-[#151A16]">{formatarMinutos(media.tempoMedioMin)}</div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[#80887D]">médio</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <div className="text-[#80887D]">Ordens</div>
                      <div className="mt-1 font-semibold text-[#151A16]">{media.ordensConcluidas}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <div className="text-[#80887D]">Melhor</div>
                      <div className="mt-1 font-semibold text-emerald-700">{formatarMinutos(media.tempoMinMin)}</div>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <div className="text-[#80887D]">Pior</div>
                      <div className="mt-1 font-semibold text-amber-700">{formatarMinutos(media.tempoMaxMin)}</div>
                    </div>
                  </div>
                </div>
              ))}
              {mediasProduto.length === 0 && (
                <div className="rounded-[18px] border border-dashed border-[#DDE3DD] px-4 py-8 text-center text-sm text-[#70786E]">
                  Ainda não há ordens concluídas suficientes para médias de produto.
                </div>
              )}
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <SectionHeader label="Resumo" title="Mapa do período" />
            <div className="mt-5 grid gap-3">
              <div className="rounded-[22px] bg-[#111A12] p-4 text-white">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-white/58">
                  <TrendingUp size={14} />
                  Utilização média
                </div>
                <div className="mt-4 text-[42px] font-semibold leading-none tracking-[-0.07em]">{formatarNumero(utilizacaoMedia)}%</div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/16">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${clampPercent(utilizacaoMedia)}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[20px] border border-[#E1E5DC] bg-[#FCFBF7] p-4">
                  <ListChecks className="text-[#687066]" size={18} />
                  <div className="mt-3 text-2xl font-semibold tracking-[-0.05em]">{indicadoresPeriodo.totalOrdens}</div>
                  <div className="text-xs text-[#737B71]">ordens no recorte</div>
                </div>
                <div className="rounded-[20px] border border-[#E1E5DC] bg-[#FCFBF7] p-4">
                  <Boxes className="text-[#687066]" size={18} />
                  <div className="mt-3 text-2xl font-semibold tracking-[-0.05em]">{formatarNumero(indicadoresPeriodo.quantidadePlanejada, 0)}</div>
                  <div className="text-xs text-[#737B71]">L planejados</div>
                </div>
                <div className="rounded-[20px] border border-[#E1E5DC] bg-[#FCFBF7] p-4">
                  <Gauge className="text-[#687066]" size={18} />
                  <div className="mt-3 text-2xl font-semibold tracking-[-0.05em]">{formatarMinutos(indicadoresPeriodo.tempoMedioCicloMin)}</div>
                  <div className="text-xs text-[#737B71]">ciclo médio</div>
                </div>
                <div className="rounded-[20px] border border-[#E1E5DC] bg-[#FCFBF7] p-4">
                  <Users className="text-[#687066]" size={18} />
                  <div className="mt-3 text-2xl font-semibold tracking-[-0.05em]">{operadoresAtivosHoje}</div>
                  <div className="text-xs text-[#737B71]">operadores hoje</div>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <Panel className="overflow-hidden">
          <div className="border-b border-[#E1E5DC] px-4 py-4 sm:px-5">
            <SectionHeader
              label="Rastreabilidade"
              title="Ordens recentes do período"
              description="Histórico operacional com planejado, real, volume, desvio e status em uma tabela mais compacta."
              action={<ArrowUpRight className="text-[#747D72]" size={18} />}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="border-b border-[#E1E5DC] bg-[#F7F5EE] text-left text-[11px] font-bold uppercase tracking-[0.17em] text-[#7A8478]">
                <tr>
                  <th className="px-5 py-3">Ordem</th>
                  <th className="px-5 py-3">Etapa</th>
                  <th className="px-5 py-3">Recurso</th>
                  <th className="px-5 py-3">Produto</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Operador</th>
                  <th className="px-5 py-3">Planejado</th>
                  <th className="px-5 py-3">Real</th>
                  <th className="px-5 py-3 text-right">Volume</th>
                  <th className="px-5 py-3 text-right">Desvio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EAE4] bg-white">
                {historyRows.slice(0, 12).map((ordem) => {
                  const plannedMinutes = Number(ordem.total_duration_minutes ?? 0)
                  const actualMinutes = obterTempoProducaoMin(ordem, agoraMs)
                  const delayMinutes = Math.max(actualMinutes - plannedMinutes, 0)

                  return (
                    <tr key={ordem.id} className="hover:bg-[#FBFAF5]">
                      <td className="px-5 py-3 font-mono font-semibold text-[#151A16]">#{ordem.numero_externo}</td>
                      <td className="px-5 py-3 capitalize text-[#626A60]">{ordem.etapa}</td>
                      <td className="px-5 py-3 text-[#626A60]">{getHistoryResource(ordem)}</td>
                      <td className="max-w-[260px] truncate px-5 py-3 font-medium text-[#151A16]">{getOrderProduct(ordem)}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(ordem)}`}>
                          {statusLabel(ordem, agoraMs)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#626A60]">{ordem.operador_nome ?? '--'}</td>
                      <td className="px-5 py-3 text-[#626A60]">
                        {formatarDataHora(ordem.inicio_agendado)} | {formatarMinutos(plannedMinutes)}
                      </td>
                      <td className="px-5 py-3 text-[#626A60]">
                        {formatarDataHora(ordem.inicio_operacao_em)} / {formatarDataHora(ordem.fim_operacao_em)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-[#151A16]">
                        {formatarNumero(obterQuantidadeProduzidaEstimada(ordem, agoraMs), 1)} L
                      </td>
                      <td className="px-5 py-3 text-right text-[#626A60]">
                        {actualMinutes > 0 ? formatarMinutos(delayMinutes) : '--'}
                      </td>
                    </tr>
                  )
                })}
                {historyRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-[#70786E]">
                      Nenhuma ordem encontrada no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}
