'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Package } from 'lucide-react'
import type { JanelaProducao } from '@/lib/planning/gantt-layout'
import type { Maquina, Operador, Ordem } from '@/types'

type AcaoOperacao = 'iniciar' | 'pausar' | 'retomar' | 'finalizar'
type PainelTab = 'envase' | 'tanque'

type Props = {
  maquinas: Maquina[]
  operadores: Operador[]
  ordens: Ordem[]
  executandoOrdemId: string | null
  operadorPorRecurso: Record<string, string>
  dia: Date
  janela: JanelaProducao
  onNavigateDay: (acao: 'prev' | 'today' | 'next') => void
  onExit: () => void
  onSelecionarOperador: (recursoKey: string, operadorId: string) => void
  onAcao: (ordem: Ordem, acao: AcaoOperacao) => Promise<void>
}

type RecursoColuna = {
  id: string
  nome: string
  tipo: PainelTab
  ordens: Ordem[]
}

function ordenarPorInicio(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    const aTime = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    return aTime - bTime
  })
}

function formatarHora(dataIso: string | null | undefined): string {
  if (!dataIso) return '--:--'
  return format(new Date(dataIso), 'HH:mm')
}

function formatarDuracaoSegundos(segundos: number): string {
  const totalSeg = Math.max(0, Math.floor(segundos))
  const horas = Math.floor(totalSeg / 3600)
  const minutos = Math.floor((totalSeg % 3600) / 60)
  const segundosRestantes = totalSeg % 60
  return [horas, minutos, segundosRestantes].map((v) => String(v).padStart(2, '0')).join(':')
}

function calcularSegundosRestantes(ordem: Ordem, agoraMs: number): number | null {
  if (ordem.status === 'pausada' && ordem.tempo_restante_pausado_seg !== null && ordem.tempo_restante_pausado_seg !== undefined) {
    return ordem.tempo_restante_pausado_seg
  }

  const fimAlvo = ordem.fim_estimado ?? ordem.fim_calculado
  if (!fimAlvo) return null
  return Math.max(0, Math.floor((new Date(fimAlvo).getTime() - agoraMs) / 1000))
}

function statusRecurso(ordens: Ordem[]) {
  if (ordens.some((ordem) => ordem.status === 'produzindo')) {
    return { label: 'Em andamento', chip: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
  }
  if (ordens.some((ordem) => ordem.status === 'pausada')) {
    return { label: 'Pausado', chip: 'bg-orange-100 text-orange-700 border-orange-200' }
  }
  if (ordens.some((ordem) => ordem.planning_status === 'WAITING_TANK')) {
    return { label: 'Aguardando tanque', chip: 'bg-amber-100 text-amber-700 border-amber-200' }
  }
  if (ordens.length > 0 && ordens.every((ordem) => ordem.status === 'concluida')) {
    return { label: 'Concluído', chip: 'bg-slate-100 text-slate-600 border-slate-200' }
  }
  return { label: 'Programado', chip: 'bg-blue-100 text-blue-700 border-blue-200' }
}

function labelStatus(ordem: Ordem): string {
  if (ordem.status === 'produzindo') return 'Em andamento'
  if (ordem.status === 'pausada') return 'Pausado'
  if (ordem.status === 'concluida') return 'Concluído'
  if (ordem.planning_status === 'WAITING_TANK') return 'Aguardando tanque'
  return 'Programada'
}

function statusClass(ordem: Ordem): string {
  if (ordem.status === 'produzindo') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (ordem.status === 'pausada') return 'bg-orange-100 text-orange-700 border-orange-200'
  if (ordem.status === 'concluida') return 'bg-slate-100 text-slate-600 border-slate-200'
  if (ordem.planning_status === 'WAITING_TANK') return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-blue-100 text-blue-700 border-blue-200'
}

function montarRecursosEnvase(maquinas: Maquina[], ordens: Ordem[]): RecursoColuna[] {
  return maquinas
    .filter((maquina) => maquina.ativa)
    .map((maquina) => ({
      id: maquina.id,
      nome: maquina.nome.toUpperCase(),
      tipo: 'envase' as const,
      ordens: ordenarPorInicio(ordens.filter((ordem) => ordem.etapa === 'envase' && ordem.maquina_id === maquina.id)),
    }))
}

function montarRecursosTanque(ordens: Ordem[]): RecursoColuna[] {
  const mapa = new Map<string, RecursoColuna>()

  ordens
    .filter((ordem) => ordem.etapa === 'tanque')
    .forEach((ordem, index) => {
      const key = ordem.tank_id ?? ordem.tanque_ref?.id ?? ordem.tanque ?? `tanque-${index}`
      const nome = ordem.tanque_ref?.nome ?? ordem.tanque ?? `Tanque ${index + 1}`
      if (!mapa.has(key)) {
        mapa.set(key, {
          id: key,
          nome: nome.toUpperCase(),
          tipo: 'tanque',
          ordens: [],
        })
      }
      mapa.get(key)?.ordens.push(ordem)
    })

  return Array.from(mapa.values()).map((recurso) => ({
    ...recurso,
    ordens: ordenarPorInicio(recurso.ordens),
  }))
}

function getResourceKey(recurso: RecursoColuna) {
  return recurso.tipo === 'envase' ? `machine:${recurso.id}` : `tank:${recurso.id}`
}

function CardOrdem({
  ordem,
  executandoOrdemId,
  ordemBloqueanteId,
  operadorSelecionadoId,
  agoraMs,
  onAcao,
}: {
  ordem: Ordem
  executandoOrdemId: string | null
  ordemBloqueanteId: string | null
  operadorSelecionadoId: string
  agoraMs: number
  onAcao: (ordem: Ordem, acao: AcaoOperacao) => Promise<void>
}) {
  const emExecucao = executandoOrdemId === ordem.id
  const podeIniciar =
    ordem.status === 'aguardando' &&
    ordem.planning_status !== 'WAITING_TANK' &&
    (!ordemBloqueanteId || ordemBloqueanteId === ordem.id)
  const podeRetomar =
    ordem.status === 'pausada' &&
    ordem.planning_status !== 'WAITING_TANK' &&
    (!ordemBloqueanteId || ordemBloqueanteId === ordem.id)
  const podePausar = ordem.status === 'produzindo'
  const podeFinalizar = ordem.status === 'produzindo' || ordem.status === 'pausada' || ordem.status === 'limpeza'
  const semOperadorSelecionado = !operadorSelecionadoId
  const restanteSegundos = calcularSegundosRestantes(ordem, agoraMs)

  return (
    <article className="rounded-[18px] border border-[#DDE1E8] bg-white p-4 shadow-[0_10px_24px_rgba(15,22,35,0.08)]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[22px] font-semibold leading-tight text-[#0F1623]">
            {ordem.produto?.nome ?? ordem.produto_sku ?? `Ordem ${ordem.numero_externo}`}
          </h3>
          <p className="mt-2 font-mono text-[14px] text-[#4A5568]">
            #{ordem.numero_externo} | {ordem.quantidade.toLocaleString('pt-BR')} {ordem.unidade} | lote {ordem.lote ?? '--'}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.08em] ${statusClass(ordem)}`}>
          {labelStatus(ordem)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-[#4A5568] xl:grid-cols-4">
        <div className="rounded-[12px] bg-[#F8FAFC] px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-[#8896A8]">Início previsto</div>
          <div className="mt-1 font-semibold text-[#0F1623]">{formatarHora(ordem.inicio_agendado)}</div>
        </div>
        <div className="rounded-[12px] bg-[#F8FAFC] px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-[#8896A8]">Início real</div>
          <div className="mt-1 font-semibold text-[#0F1623]">{formatarHora(ordem.inicio_operacao_em)}</div>
        </div>
        <div className="rounded-[12px] bg-[#F8FAFC] px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-[#8896A8]">Fim previsto</div>
          <div className="mt-1 font-semibold text-[#0F1623]">{formatarHora(ordem.fim_estimado ?? ordem.fim_calculado)}</div>
        </div>
        <div className="rounded-[12px] bg-[#F8FAFC] px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-[#8896A8]">Operador</div>
          <div className="mt-1 font-semibold text-[#0F1623]">{ordem.operador_nome ?? '--'}</div>
        </div>
      </div>

      {restanteSegundos !== null && (ordem.status === 'produzindo' || ordem.status === 'pausada') && (
        <div className="mt-4 rounded-[14px] bg-[#0F172A] px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[#94A3B8]">
            {ordem.status === 'pausada' ? 'Tempo restante pausado' : 'Tempo restante'}
          </div>
          <div className="mt-1 font-mono text-[34px] font-bold text-white">{formatarDuracaoSegundos(restanteSegundos)}</div>
        </div>
      )}

      {ordem.planning_status === 'WAITING_TANK' && (
        <div className="mt-4 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Esta ordem de envase já foi criada, mas só pode iniciar quando a ordem do tanque vinculada estiver concluída.
        </div>
      )}

      {semOperadorSelecionado && (
        <div className="mt-4 rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
          Selecione um operador para liberar as ações desse recurso.
        </div>
      )}

      {ordem.observacao_pausa && (
        <div className="mt-4 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Motivo da pausa: {ordem.observacao_pausa}
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          onClick={() => onAcao(ordem, podeRetomar ? 'retomar' : 'iniciar')}
          disabled={(!podeIniciar && !podeRetomar) || emExecucao || semOperadorSelecionado}
          className="h-11 rounded-[12px] bg-[#2563EB] px-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {emExecucao && (podeIniciar || podeRetomar)
            ? podeRetomar ? 'Retomando...' : 'Iniciando...'
            : podeRetomar ? 'Retomar' : 'Iniciar'}
        </button>
        <button
          onClick={() => onAcao(ordem, 'pausar')}
          disabled={!podePausar || emExecucao || semOperadorSelecionado}
          className="h-11 rounded-[12px] border border-[#D97706] bg-white px-3 text-[15px] font-semibold text-[#D97706] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {emExecucao && podePausar ? 'Pausando...' : 'Pausar'}
        </button>
        <button
          onClick={() => onAcao(ordem, 'finalizar')}
          disabled={!podeFinalizar || emExecucao || semOperadorSelecionado}
          className="h-11 rounded-[12px] bg-[#16A34A] px-3 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {emExecucao && podeFinalizar ? 'Concluindo...' : 'Concluir'}
        </button>
      </div>
    </article>
  )
}

function ColunaRecurso({
  recurso,
  operadores,
  operadorPorRecurso,
  onSelecionarOperador,
  executandoOrdemId,
  agoraMs,
  onAcao,
}: {
  recurso: RecursoColuna
  operadores: Operador[]
  operadorPorRecurso: Record<string, string>
  onSelecionarOperador: (recursoKey: string, operadorId: string) => void
  executandoOrdemId: string | null
  agoraMs: number
  onAcao: (ordem: Ordem, acao: AcaoOperacao) => Promise<void>
}) {
  const ordemBloqueante = recurso.ordens.find((ordem) => ordem.status === 'produzindo' || ordem.status === 'pausada')
  const status = statusRecurso(recurso.ordens)
  const recursoKey = getResourceKey(recurso)
  const operadorSelecionadoId = operadorPorRecurso[recursoKey] ?? ''
  const operadorSelecionado = operadores.find((operador) => operador.id === operadorSelecionadoId) ?? null

  return (
    <section className="flex h-full min-h-0 flex-col rounded-[18px] border border-[#DDE1E8] bg-[#FFFFFF]">
      <header className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
        <div>
          <h2 className="text-[26px] font-bold text-[#0F1623]">{recurso.nome}</h2>
          <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.08em] ${status.chip}`}>
            {status.label}
          </span>
          <div className="mt-3">
            <select
              value={operadorSelecionadoId}
              onChange={(e) => onSelecionarOperador(recursoKey, e.target.value)}
              className="h-9 min-w-60 rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-sm text-[#111827]"
            >
              <option value="">Selecione o operador...</option>
              {operadores.map((operador) => (
                <option key={operador.id} value={operador.id}>
                  {operador.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-[#94A3B8]">Ordens no recurso</div>
          <div className="mt-1 text-[28px] font-semibold text-[#0F1623]">{recurso.ordens.length}</div>
          <div className="mt-2 text-[12px] text-[#667085]">
            Operador: <span className="font-semibold">{operadorSelecionado?.nome ?? '--'}</span>
          </div>
        </div>
      </header>

      {recurso.ordens.length === 0 ? (
        <div className="m-5 flex min-h-0 flex-1 items-center justify-center rounded-[20px] border border-dashed border-[#DDE1E8] bg-[#FAFBFC]">
          <div className="text-center">
            <Package size={52} color="#94A3B8" className="mx-auto" />
            <p className="mt-4 text-[20px] font-semibold text-[#475467]">Sem ordens programadas</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          {recurso.ordens.map((ordem) => (
            <CardOrdem
              key={ordem.id}
              ordem={ordem}
              executandoOrdemId={executandoOrdemId}
              ordemBloqueanteId={ordemBloqueante?.id ?? null}
              operadorSelecionadoId={operadorSelecionadoId}
              agoraMs={agoraMs}
              onAcao={onAcao}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function OperacaoTvPanel({
  maquinas,
  operadores,
  ordens,
  executandoOrdemId,
  operadorPorRecurso,
  dia,
  janela,
  onNavigateDay,
  onExit,
  onSelecionarOperador,
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
  const janelaLabel = `${String(janela.startHour).padStart(2, '0')}:00 - ${String(janela.endHour % 24 === 0 ? 0 : janela.endHour).padStart(2, '0')}:00`

  return (
    <div className="fixed inset-0 z-[100] h-screen w-screen overflow-hidden bg-[#F3F5F7] text-[#0F1623]">
      <div className="grid h-full grid-rows-[72px_76px_1fr]">
        <header className="flex items-center gap-4 border-b border-[#DDE1E8] bg-white px-6">
          <div>
            <div className="text-[24px] font-bold">Painel de Produção</div>
            <div className="text-[13px] text-[#667085]">
              {format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })} | turno {janelaLabel}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="rounded-full bg-[#F8FAFC] px-4 py-2 text-[14px] font-medium text-[#475467]">
              Operadores ativos: {operadores.length}
            </div>
            <div className="rounded-full bg-[#0F172A] px-4 py-2 font-mono text-[18px] font-semibold text-white">
              {format(agora, 'HH:mm:ss')}
            </div>
            <button onClick={() => onNavigateDay('prev')} className="rounded-full border border-[#D0D5DD] bg-white px-4 py-2 text-[14px] font-medium text-[#344054]">
              Ontem
            </button>
            <button onClick={() => onNavigateDay('today')} className="rounded-full border border-[#2563EB] bg-[#EFF6FF] px-4 py-2 text-[14px] font-semibold text-[#2563EB]">
              Hoje
            </button>
            <button onClick={() => onNavigateDay('next')} className="rounded-full border border-[#D0D5DD] bg-white px-4 py-2 text-[14px] font-medium text-[#344054]">
              Amanhã
            </button>
            <button onClick={onExit} className="rounded-full px-3 py-2 text-[14px] text-[#667085]">
              Sair
            </button>
          </div>
        </header>

        <div className="flex items-center gap-4 px-6">
          <div className="inline-flex rounded-full bg-[#E5E7EB] p-1">
            {(['envase', 'tanque'] as const).map((tab) => {
              const ativa = tab === tabAtiva
              return (
                <button
                  key={tab}
                  onClick={() => setTabAtiva(tab)}
                  className={`min-w-36 rounded-full px-5 py-3 text-[15px] font-semibold uppercase tracking-[0.08em] transition ${
                    ativa ? 'bg-[#2563EB] text-white shadow-[0_8px_18px_rgba(37,99,235,0.35)]' : 'text-[#4B5563]'
                  }`}
                >
                  {tab}
                </button>
              )
            })}
          </div>
        </div>

        <main className="min-h-0 overflow-hidden px-6 pb-6">
          {recursos.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-[20px] border border-dashed border-[#DDE1E8] bg-white">
              <div className="text-center">
                <Package size={56} color="#94A3B8" className="mx-auto" />
                <p className="mt-4 text-[22px] font-semibold text-[#475467]">Nenhum recurso ativo</p>
                <p className="text-[16px] text-[#667085]">Não há ordens para o painel selecionado.</p>
              </div>
            </div>
          ) : (
            <div
              className="grid h-full gap-4 overflow-hidden"
              style={{ gridTemplateColumns: `repeat(${recursos.length}, minmax(0, 1fr))` }}
            >
              {recursos.map((recurso) => (
                <ColunaRecurso
                  key={recurso.id}
                  recurso={recurso}
                  operadores={operadores}
                  operadorPorRecurso={operadorPorRecurso}
                  onSelecionarOperador={onSelecionarOperador}
                  executandoOrdemId={executandoOrdemId}
                  agoraMs={agora.getTime()}
                  onAcao={onAcao}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
