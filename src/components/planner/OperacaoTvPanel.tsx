'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Package } from 'lucide-react'
import type { JanelaProducao } from '@/lib/planning/gantt-layout'
import type { Maquina, Ordem } from '@/types'

type AcaoOperacao = 'iniciar' | 'finalizar'
type PainelTab = 'envase' | 'tanque'

type Props = {
  maquinas: Maquina[]
  ordens: Ordem[]
  executandoOrdemId: string | null
  dia: Date
  janela: JanelaProducao
  onNavigateDay: (acao: 'prev' | 'today' | 'next') => void
  onExit: () => void
  onAcao: (ordemId: string, acao: AcaoOperacao) => Promise<void>
}

type RecursoColuna = {
  id: string
  nome: string
  ordens: Ordem[]
  tipo: PainelTab
}

const TV_COLORS = {
  bgBase: '#F4F6F8',
  bgPanel: '#FFFFFF',
  bgSubtle: '#EBEEF2',
  border: '#DDE1E8',
  borderStrong: '#C4CAD4',
  textPrimary: '#0F1623',
  textSecondary: '#4A5568',
  textMuted: '#8896A8',
  accent: '#2563EB',
  accentSubtle: '#EFF6FF',
  success: '#16A34A',
  successSubtle: '#F0FDF4',
  warning: '#D97706',
  warningSubtle: '#FFFBEB',
  danger: '#DC2626',
  dangerSubtle: '#FEF2F2',
  neutral: '#64748B',
}

function ordenarPorInicio(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    const aTime = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    return aTime - bTime
  })
}

function prioridadeStatus(status: Ordem['status']): number {
  if (status === 'produzindo') return 0
  if (status === 'limpeza') return 1
  if (status === 'atrasada') return 2
  if (status === 'aguardando') return 3
  if (status === 'concluida') return 4
  return 5
}

function formatarHoraMin(dataIso: string | null | undefined): string {
  if (!dataIso) return '--:--'
  return format(new Date(dataIso), 'HH:mm')
}

function formatarDuracao(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00:00'
  const totalSeg = Math.floor(ms / 1000)
  const horas = Math.floor(totalSeg / 3600)
  const min = Math.floor((totalSeg % 3600) / 60)
  const seg = totalSeg % 60
  return [horas, min, seg].map((valor) => String(valor).padStart(2, '0')).join(':')
}

function formatarEstimativaCurta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0min'
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}min`
  return `${h}h ${m}min`
}

function statusChip(status: Ordem['status']) {
  if (status === 'produzindo') return { label: 'Em Produção', bg: TV_COLORS.accentSubtle, text: TV_COLORS.accent }
  if (status === 'limpeza') return { label: 'Limpeza', bg: TV_COLORS.warningSubtle, text: TV_COLORS.warning }
  if (status === 'concluida') return { label: 'Concluída', bg: TV_COLORS.successSubtle, text: TV_COLORS.success }
  if (status === 'atrasada') return { label: 'Atrasada', bg: TV_COLORS.dangerSubtle, text: TV_COLORS.danger }
  return { label: 'Agendada', bg: TV_COLORS.bgSubtle, text: TV_COLORS.neutral }
}

function statusRecurso(ordens: Ordem[]) {
  if (ordens.some((ordem) => ordem.status === 'produzindo')) {
    return { label: 'Em Produção', color: TV_COLORS.accent, pulse: true }
  }
  if (ordens.length > 0 && ordens.every((ordem) => ordem.status === 'concluida')) {
    return { label: 'Concluído', color: TV_COLORS.success, pulse: false }
  }
  return { label: 'Aguardando', color: TV_COLORS.neutral, pulse: false }
}

function montarRecursosEnvase(maquinas: Maquina[], ordens: Ordem[]): RecursoColuna[] {
  return maquinas
    .filter((m) => m.ativa)
    .map((maquina) => ({
      id: maquina.id,
      nome: maquina.nome.toUpperCase(),
      tipo: 'envase' as const,
      ordens: ordenarPorInicio(ordens.filter((ordem) => ordem.etapa === 'envase' && ordem.maquina_id === maquina.id)),
    }))
}

function montarRecursosTanque(ordens: Ordem[]): RecursoColuna[] {
  const tanques = ordens.filter((ordem) => ordem.etapa === 'tanque')
  const mapa = new Map<string, RecursoColuna>()

  tanques.forEach((ordem, index) => {
    const key = ordem.tank_id ?? ordem.tanque_ref?.id ?? ordem.tanque ?? `tanque-sem-id-${index}`
    const nomeBase = ordem.tanque_ref?.nome ?? ordem.tanque ?? `TANQUE ${index + 1}`
    const nome = nomeBase.toUpperCase().startsWith('TANQUE') ? nomeBase.toUpperCase() : `TANQUE ${nomeBase.toUpperCase()}`

    if (!mapa.has(key)) {
      mapa.set(key, { id: key, nome, tipo: 'tanque', ordens: [] })
    }

    mapa.get(key)?.ordens.push(ordem)
  })

  return Array.from(mapa.values()).map((recurso) => ({
    ...recurso,
    ordens: ordenarPorInicio(recurso.ordens),
  }))
}

function selecionarOrdensVisiveis(ordens: Ordem[]) {
  const ordenadas = [...ordens].sort((a, b) => {
    const diffPrioridade = prioridadeStatus(a.status) - prioridadeStatus(b.status)
    if (diffPrioridade !== 0) return diffPrioridade
    const aTime = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    return aTime - bTime
  })

  const possuiHero = ordenadas.some((ordem) => ordem.status === 'produzindo' || ordem.status === 'limpeza')
  const limite = possuiHero ? 3 : 4
  return {
    visiveis: ordenadas.slice(0, limite),
    ocultas: Math.max(0, ordenadas.length - limite),
  }
}

function calcularMetricasTempo(ordem: Ordem, agoraMs: number) {
  const inicioMs = ordem.inicio_operacao_em
    ? new Date(ordem.inicio_operacao_em).getTime()
    : ordem.inicio_agendado
      ? new Date(ordem.inicio_agendado).getTime()
      : null

  const fimMs = ordem.fim_calculado ? new Date(ordem.fim_calculado).getTime() : null
  const totalMs = inicioMs !== null && fimMs !== null ? Math.max(1, fimMs - inicioMs) : null
  const elapsedMs = inicioMs !== null ? Math.max(0, agoraMs - inicioMs) : 0
  const remainingMs = fimMs !== null ? Math.max(0, fimMs - agoraMs) : 0
  const progressPct = totalMs ? (elapsedMs / totalMs) * 100 : 0

  return {
    elapsedMs,
    remainingMs,
    totalMs,
    progressPct,
  }
}

function CardOrdem({
  ordem,
  hero,
  agoraMs,
  executandoOrdemId,
  ordemProduzindoId,
  mostrarFasesTanque,
  habilitarAcoes,
  onAcao,
}: {
  ordem: Ordem
  hero: boolean
  agoraMs: number
  executandoOrdemId: string | null
  ordemProduzindoId: string | null
  mostrarFasesTanque: boolean
  habilitarAcoes: boolean
  onAcao: (ordemId: string, acao: AcaoOperacao) => Promise<void>
}) {
  const chip = statusChip(ordem.status)
  const emExecucao = executandoOrdemId === ordem.id
  const podeIniciar = (ordem.status === 'aguardando' || ordem.status === 'atrasada') && (!ordemProduzindoId || ordemProduzindoId === ordem.id)
  const podeFinalizar = ordem.status === 'produzindo' || ordem.status === 'limpeza'
  const isConcluida = ordem.status === 'concluida'
  const isLimpeza = ordem.status === 'limpeza'
  const isAtrasada = ordem.status === 'atrasada'
  const { elapsedMs, remainingMs, totalMs, progressPct } = calcularMetricasTempo(ordem, agoraMs)

  const progressoLimitado = Math.max(0, Math.min(progressPct, 100))
  const progressoCor =
    progressPct >= 90 ? TV_COLORS.danger : progressPct >= 75 ? TV_COLORS.warning : TV_COLORS.accent

  const cardBase = isConcluida
    ? {
        background: TV_COLORS.successSubtle,
        borderLeft: `4px solid ${TV_COLORS.success}`,
      }
    : isLimpeza
      ? {
          background: TV_COLORS.warningSubtle,
          borderLeft: `4px solid ${TV_COLORS.warning}`,
        }
      : hero
        ? {
            background: 'linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 46%)',
            borderLeft: `4px solid ${TV_COLORS.accent}`,
          }
        : {
            background: '#FFFFFF',
            borderLeft: `4px solid ${isAtrasada ? TV_COLORS.danger : TV_COLORS.borderStrong}`,
          }

  return (
    <article
      className={`rounded-[10px] border p-4 ${hero ? 'shadow-[0_10px_24px_rgba(15,22,35,0.12)]' : 'shadow-[0_2px_8px_rgba(15,22,35,0.05)]'} ${
        isConcluida ? 'py-3' : ''
      }`}
      style={{ borderColor: TV_COLORS.border, ...cardBase }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={`truncate text-[#0F1623] ${hero ? 'text-[22px] font-bold leading-tight' : 'text-[20px] font-semibold leading-tight'} ${
              isConcluida ? 'text-[18px]' : ''
            }`}
            title={ordem.produto?.nome ?? ordem.produto_sku ?? ordem.numero_externo}
          >
            {ordem.produto?.nome ?? ordem.produto_sku ?? `Ordem ${ordem.numero_externo}`}
          </h3>
          <p className={`${hero ? 'mt-2 text-[16px]' : 'mt-1 text-[14px]'} font-mono text-[#4A5568]`}>
            {ordem.produto_sku ?? '--'} • Lote {ordem.lote?.toUpperCase() ?? '--'} • {ordem.quantidade.toLocaleString('pt-BR')} {ordem.unidade}
          </p>
        </div>
        <div className="flex min-w-[120px] flex-col items-end gap-2">
          <span
            className="inline-flex rounded-full px-2.5 py-1 text-[13px] font-semibold"
            style={{ background: chip.bg, color: chip.text }}
          >
            {chip.label}
          </span>
          <span className="text-[13px] text-[#8896A8]">{formatarHoraMin(ordem.inicio_agendado)}</span>
        </div>
      </div>

      {(hero || isLimpeza) && !isConcluida && (
        <div className="mt-4 rounded-[10px] bg-[#F8FAFC] px-4 py-3">
          <div className="text-center text-[11px] uppercase tracking-[0.1em] text-[#8896A8]">Tempo Decorrido</div>
          <div className={`mt-1 text-center font-mono text-[52px] font-bold ${isLimpeza ? 'text-[#D97706]' : 'text-[#2563EB]'}`}>
            {formatarDuracao(elapsedMs)}
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#EBEEF2]">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${progressPct >= 90 ? 'animate-[status-pulse_1s_infinite]' : ''}`}
              style={{ width: `${progressoLimitado}%`, background: progressoCor }}
            />
          </div>

          <div className="mt-2 text-center text-[13px] text-[#8896A8]">
            Estimado: {formatarEstimativaCurta(totalMs ?? 0)} | Restante: {formatarEstimativaCurta(remainingMs)}
          </div>
        </div>
      )}

      {mostrarFasesTanque && (
        <div className="mt-3 rounded-[8px] border border-[#DDE1E8] bg-[#F8FAFC] px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.08em] text-[#8896A8]">Fases</div>
          <div className="mt-1 flex items-center gap-2 text-[13px] font-semibold text-[#4A5568]">
            <span className="rounded-full bg-[#DBEAFE] px-2 py-0.5 text-[#1D4ED8]">1</span>
            Mistura
            <span className="text-[#C4CAD4]">→</span>
            <span className="rounded-full bg-[#EBEEF2] px-2 py-0.5">2</span>
            Repouso
            <span className="text-[#C4CAD4]">→</span>
            <span className="rounded-full bg-[#EBEEF2] px-2 py-0.5">3</span>
            Transferência
          </div>
        </div>
      )}

      {!isConcluida && habilitarAcoes && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onAcao(ordem.id, 'iniciar')}
            disabled={!podeIniciar || emExecucao}
            className="h-10 flex-1 rounded-[10px] border border-[#D97706] bg-white text-[15px] font-semibold text-[#D97706] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {emExecucao && podeIniciar ? 'Iniciando...' : 'Iniciar'}
          </button>
          <button
            onClick={() => onAcao(ordem.id, 'finalizar')}
            disabled={!podeFinalizar || emExecucao}
            className="h-10 flex-1 rounded-[10px] bg-[#16A34A] text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {emExecucao && podeFinalizar ? 'Finalizando...' : 'Concluir'}
          </button>
        </div>
      )}

      {!isConcluida && !habilitarAcoes && (
        <div className="mt-3 rounded-[8px] bg-[#EBEEF2] px-3 py-2 text-[13px] text-[#64748B]">
          Controle operacional indisponível nesta ordem.
        </div>
      )}
    </article>
  )
}

function ColunaRecurso({
  recurso,
  executandoOrdemId,
  agoraMs,
  onAcao,
}: {
  recurso: RecursoColuna
  executandoOrdemId: string | null
  agoraMs: number
  onAcao: (ordemId: string, acao: AcaoOperacao) => Promise<void>
}) {
  const ordens = recurso.ordens
  const status = statusRecurso(ordens)
  const ordemProduzindo = ordens.find((ordem) => ordem.status === 'produzindo')
  const { visiveis, ocultas } = selecionarOrdensVisiveis(ordens)

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#FFFFFF]">
      <header className="flex h-20 items-center justify-between border-b border-[#DDE1E8] px-4">
        <div className="min-w-0">
          <h2 className="truncate text-[28px] font-bold text-[#0F1623]">{recurso.nome}</h2>
          <div className="mt-1 flex items-center gap-2 text-[14px] text-[#4A5568]">
            <span
              className={`h-2.5 w-2.5 rounded-full ${status.pulse ? 'animate-[status-pulse_1.5s_infinite]' : ''}`}
              style={{ background: status.color }}
            />
            {status.label}
          </div>
        </div>
        <span className="rounded-full bg-[#EBEEF2] px-3 py-1 text-[14px] text-[#64748B]">{ordens.length} ordens</span>
      </header>

      {ordens.length === 0 ? (
        <div className="m-4 flex min-h-0 flex-1 items-center justify-center rounded-[20px] border border-dashed border-[#DDE1E8] bg-[#FAFBFC]">
          <div className="text-center">
            <Package size={48} color="#8896A8" className="mx-auto" />
            <p className="mt-4 text-[18px] text-[#64748B]">Sem ordens agendadas</p>
            <p className="text-[15px] text-[#8896A8]">para este recurso</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {visiveis.map((ordem) => (
            <CardOrdem
              key={ordem.id}
              ordem={ordem}
              hero={ordem.status === 'produzindo'}
              agoraMs={agoraMs}
              executandoOrdemId={executandoOrdemId}
              ordemProduzindoId={ordemProduzindo?.id ?? null}
              mostrarFasesTanque={recurso.tipo === 'tanque'}
              habilitarAcoes={recurso.tipo === 'envase' || Boolean(ordem.maquina_id)}
              onAcao={onAcao}
            />
          ))}

          {ocultas > 0 && (
            <div className="mt-auto rounded-[10px] border border-[#DDE1E8] bg-[#F8FAFC] px-3 py-2 text-center text-[15px] font-semibold text-[#64748B]">
              +{ocultas} ordens não exibidas neste turno
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export function OperacaoTvPanel({
  maquinas,
  ordens,
  executandoOrdemId,
  dia,
  janela,
  onNavigateDay,
  onExit,
  onAcao,
}: Props) {
  const [agora, setAgora] = useState(() => new Date())
  const [tabAtiva, setTabAtiva] = useState<PainelTab>('envase')

  useEffect(() => {
    const interval = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const recursosEnvase = useMemo(() => montarRecursosEnvase(maquinas, ordens), [maquinas, ordens])
  const recursosTanque = useMemo(() => montarRecursosTanque(ordens), [ordens])
  const recursos = tabAtiva === 'envase' ? recursosEnvase : recursosTanque

  const dataLabel = format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })
  const janelaLabel = `${String(janela.startHour).padStart(2, '0')}:00 - ${String(janela.endHour % 24 === 0 ? 0 : janela.endHour).padStart(2, '0')}:00`

  return (
    <div className="fixed inset-0 z-[100] h-screen w-screen overflow-hidden bg-[#F4F6F8] text-[#0F1623]">
      <div className="grid h-full grid-rows-[60px_64px_1fr]">
        <header className="flex items-center border-b border-[#DDE1E8] bg-[#FFFFFF] px-5">
          <div className="min-w-[280px] text-[20px] font-bold">Painel de Produção</div>

          <div className="flex-1 text-center text-[16px] text-[#8896A8]">
            {dataLabel} • Turno ativo {janelaLabel}
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="font-mono text-[18px] font-semibold text-[#0F1623]">{format(agora, 'HH:mm:ss')}</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#F0FDF4] px-3 py-1 text-[13px] font-semibold text-[#16A34A]">
              <span className="h-2 w-2 rounded-full bg-[#16A34A] animate-[status-pulse_1.2s_infinite]" />
              EM PRODUCAO
            </span>
            <button
              onClick={() => onNavigateDay('prev')}
              className="h-8 rounded-full border border-[#C4CAD4] bg-white px-3 text-[13px] font-medium text-[#4A5568]"
            >
              Ontem
            </button>
            <button
              onClick={() => onNavigateDay('today')}
              className="h-8 rounded-full border border-[#2563EB] bg-[#EFF6FF] px-3 text-[13px] font-semibold text-[#2563EB]"
            >
              Hoje
            </button>
            <button
              onClick={() => onNavigateDay('next')}
              className="h-8 rounded-full border border-[#C4CAD4] bg-white px-3 text-[13px] font-medium text-[#4A5568]"
            >
              Amanhã
            </button>
            <button onClick={onExit} className="h-8 rounded-full px-2 text-[13px] text-[#8896A8]">
              Sair
            </button>
          </div>
        </header>

        <div className="flex items-center px-5">
          <div className="inline-flex h-12 rounded-full bg-[#EBEEF2] p-1">
            {(['envase', 'tanque'] as const).map((tab) => {
              const ativa = tabAtiva === tab
              return (
                <button
                  key={tab}
                  onClick={() => setTabAtiva(tab)}
                  className={`min-w-36 rounded-full px-5 text-[15px] font-semibold uppercase tracking-[0.05em] transition ${
                    ativa ? 'bg-[#2563EB] text-white shadow-[0_5px_14px_rgba(37,99,235,0.35)]' : 'text-[#4A5568]'
                  }`}
                >
                  {tab}
                </button>
              )
            })}
          </div>
        </div>

        <main className="min-h-0 overflow-hidden px-5 pb-5">
          {recursos.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-[16px] border border-dashed border-[#DDE1E8] bg-[#FFFFFF]">
              <div className="text-center">
                <Package size={56} color="#8896A8" className="mx-auto" />
                <p className="mt-4 text-[20px] font-semibold text-[#4A5568]">Nenhum recurso ativo</p>
                <p className="text-[16px] text-[#8896A8]">Não há ordens para o painel selecionado.</p>
              </div>
            </div>
          ) : (
            <div
              className="grid h-full overflow-hidden rounded-[12px] border border-[#DDE1E8] bg-[#FFFFFF]"
              style={{ gridTemplateColumns: `repeat(${recursos.length}, minmax(0, 1fr))` }}
            >
              {recursos.map((recurso, index) => (
                <div key={recurso.id} className={index > 0 ? 'border-l border-[#DDE1E8]' : ''}>
                  <ColunaRecurso
                    recurso={recurso}
                    executandoOrdemId={executandoOrdemId}
                    agoraMs={agora.getTime()}
                    onAcao={onAcao}
                  />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
