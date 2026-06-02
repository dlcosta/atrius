'use client'
import { apiUrl } from '@/lib/api'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Factory,
  Gauge,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  TimerReset,
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
} from '@/lib/monitoring/indicadores'
import { mesmoDia, pertenceAoDia } from '@/lib/planning/datas-ordem'

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

function statusLabel(ordem: Ordem | null): string {
  if (!ordem) return 'Sem ordem'
  if (ordem.status === 'produzindo') return 'Em andamento'
  if (ordem.status === 'pausada') return 'Pausada'
  if (ordem.status === 'concluida') return 'Concluída'
  if (ordem.planning_status === 'WAITING_TANK') return 'Aguardando tanque'
  return 'Programada'
}

function statusClasses(ordem: Ordem | null): string {
  if (!ordem) return 'border-slate-200 bg-slate-50 text-slate-500'
  if (ordem.status === 'produzindo') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (ordem.status === 'pausada') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (ordem.status === 'concluida') return 'border-slate-200 bg-slate-100 text-slate-600'
  if (ordem.planning_status === 'WAITING_TANK') return 'border-orange-200 bg-orange-50 text-orange-700'
  return 'border-blue-200 bg-blue-50 text-blue-700'
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
  const proxima = ordenadas.find((ordem) => {
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

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'slate',
}: {
  title: string
  value: string
  subtitle: string
  icon: typeof Activity
  tone?: 'slate' | 'blue' | 'emerald' | 'amber'
}) {
  const toneMap = {
    slate: 'border-slate-200 bg-white text-slate-900',
    blue: 'border-blue-200 bg-blue-50/80 text-blue-950',
    emerald: 'border-emerald-200 bg-emerald-50/80 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50/80 text-amber-950',
  }

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-semibold leading-none">{value}</div>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/80 p-2 text-slate-600 shadow-sm">
          <Icon size={18} />
        </div>
      </div>
      <div className="mt-3 text-sm text-slate-600">{subtitle}</div>
    </div>
  )
}

function LiveCard({ card, agoraMs }: { card: LiveResourceCard; agoraMs: number }) {
  const restanteMs = card.atual ? calcularTempoRestanteMs(card.atual, agoraMs) : null

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {card.tipo === 'maquina' ? 'Máquina' : 'Tanque'}
          </div>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{card.nome}</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(card.atual)}`}>
          {statusLabel(card.atual)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Ordens hoje</div>
          <div className="mt-1 font-semibold text-slate-900">{card.ordens.length}</div>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Volume estimado</div>
          <div className="mt-1 font-semibold text-slate-900">{formatarNumero(card.volumeHoje, 2)} L</div>
        </div>
      </div>

      {card.atual ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-900">#{card.atual.numero_externo}</div>
            <div className="text-xs text-slate-500">{card.atual.operador_nome ?? 'Operador não informado'}</div>
          </div>
          <div className="mt-1 text-sm text-slate-700">{card.atual.produto?.nome ?? card.atual.produto_sku ?? '--'}</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Início</div>
              <div className="mt-1 font-medium text-slate-900">{formatarHora(card.atual.inicio_operacao_em ?? card.atual.inicio_agendado)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Restante</div>
              <div className="mt-1 font-medium text-slate-900">
                {restanteMs === null ? '--' : formatarDuracaoRelogio(restanteMs)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          Nenhuma ordem ativa neste recurso agora.
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
        <div className="text-xs uppercase tracking-wide text-slate-400">Próxima ordem</div>
        <div className="mt-1 font-medium text-slate-900">
          {card.proxima ? `#${card.proxima.numero_externo} · ${formatarHora(card.proxima.inicio_agendado)}` : 'Sem próxima ordem no dia'}
        </div>
      </div>
    </article>
  )
}

export default function MonitoramentoPage() {
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
    () => ordensHoje.filter((ordem) => ordem.status !== 'cancelada').filter((ordem) => pertenceAoDia(ordem, hojeYmd)),
    [ordensHoje, hojeYmd]
  )

  const ordensPeriodoValidas = useMemo(
    () => ordensPeriodo.filter((ordem) => ordem.status !== 'cancelada'),
    [ordensPeriodo]
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
    return (
      desempenhoMaquinas.reduce((acc, maquina) => acc + maquina.utilizationRate, 0) / desempenhoMaquinas.length
    )
  }, [desempenhoMaquinas])

  const operadoresAtivosHoje = useMemo(() => {
    return new Set(
      ordensHojeValidas
        .filter((ordem) => ordem.status === 'produzindo' || ordem.status === 'pausada')
        .map((ordem) => ordem.operador_nome)
        .filter(Boolean)
    ).size
  }, [ordensHojeValidas])

  function aplicarPreset(dias: number) {
    const fim = format(new Date(), 'yyyy-MM-dd')
    const inicio = format(subDays(new Date(), dias - 1), 'yyyy-MM-dd')
    setPeriodStart(inicio)
    setPeriodEnd(fim)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#F7F8FA]">
      <div className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Painel de acompanhamento
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">Produção ao vivo e histórico operacional</h1>
            <p className="mt-1 text-sm text-slate-500">
              Visão do dia para operação e análise do período para gestão.
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => aplicarPreset(1)}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Hoje
            </button>
            <button
              onClick={() => aplicarPreset(7)}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              7 dias
            </button>
            <button
              onClick={() => aplicarPreset(30)}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              30 dias
            </button>
            <button
              onClick={carregarDados}
              disabled={carregando}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-wrap items-end gap-3 px-6 pb-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Início
            </label>
            <input
              type="date"
              value={periodStart}
              max={periodEnd}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Fim
            </label>
            <input
              type="date"
              value={periodEnd}
              min={periodStart}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            />
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <div className="font-semibold">Período selecionado</div>
            <div className="mt-1 text-blue-800">
              {format(new Date(`${periodStart}T00:00:00`), "dd 'de' MMM", { locale: ptBR })} até{' '}
              {format(new Date(`${periodEnd}T00:00:00`), "dd 'de' MMM yyyy", { locale: ptBR })}
            </div>
          </div>
        </div>
      </div>

      {erro && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-800">{erro}</div>
      )}

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172554_52%,#1d4ed8_100%)] p-6 text-white shadow-[0_20px_80px_rgba(15,23,42,0.18)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-blue-100">
                <Activity size={13} />
                Centro operacional
              </div>
              <h2 className="mt-4 text-3xl font-semibold leading-tight">
                O que está rodando agora e o que o período conta sobre a sua produção.
              </h2>
              <p className="mt-3 max-w-xl text-sm text-blue-100/85">
                O topo mostra a foto do turno atual. Abaixo, você acompanha desempenho de máquinas,
                operadores, pausas e histórico consolidado.
              </p>
            </div>

            <div className="grid min-w-[280px] grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-blue-100/70">Em produção agora</div>
                <div className="mt-1 text-3xl font-semibold">
                  {ordensHojeValidas.filter((ordem) => ordem.status === 'produzindo').length}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-blue-100/70">Pausadas agora</div>
                <div className="mt-1 text-3xl font-semibold">
                  {ordensHojeValidas.filter((ordem) => ordem.status === 'pausada').length}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-blue-100/70">Operadores ativos</div>
                <div className="mt-1 text-3xl font-semibold">{operadoresAtivosHoje}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-blue-100/70">Máquinas ativas</div>
                <div className="mt-1 text-3xl font-semibold">
                  {liveMachineCards.filter((card) => card.atual).length}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Ordens no período"
            value={String(indicadoresPeriodo.totalOrdens)}
            subtitle="Todas as ordens que tocaram o período filtrado."
            icon={CalendarRange}
          />
          <KpiCard
            title="Concluídas"
            value={String(indicadoresPeriodo.ordensConcluidas)}
            subtitle="Ordens encerradas com dados operacionais no período."
            icon={CheckCircle2}
            tone="emerald"
          />
          <KpiCard
            title="Volume processado"
            value={`${formatarNumero(litrosPeriodo, 2)} L`}
            subtitle="Volume estimado ou concluído consolidado no período."
            icon={Factory}
            tone="blue"
          />
          <KpiCard
            title="Paradas registradas"
            value={formatarMinutos(pausasPeriodoMin)}
            subtitle="Tempo em pausa registrado pelas máquinas no período."
            icon={PauseCircle}
            tone="amber"
          />
          <KpiCard
            title="Utilização média"
            value={`${formatarNumero(utilizacaoMedia)}%`}
            subtitle="Tempo em produção vs período selecionado."
            icon={Gauge}
            tone="blue"
          />
          <KpiCard
            title="Ciclo médio"
            value={formatarMinutos(indicadoresPeriodo.tempoMedioCicloMin)}
            subtitle="Média real das ordens com início e fim operacionais."
            icon={TimerReset}
          />
          <KpiCard
            title="Em andamento"
            value={String(indicadoresPeriodo.ordensEmProducao)}
            subtitle="Ordens ainda abertas no recorte atual."
            icon={PlayCircle}
            tone="emerald"
          />
          <KpiCard
            title="Atrasos abertos"
            value={String(indicadoresPeriodo.ordensAtrasadas)}
            subtitle="Ordens não concluídas cujo fim previsto já passou."
            icon={AlertTriangle}
            tone="amber"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ao vivo</div>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Recursos em tempo real</h2>
                <p className="mt-1 text-sm text-slate-500">Máquinas e tanques com a foto operacional de hoje.</p>
              </div>
              <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Atualização a cada {REFRESH_MS / 1000}s
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {liveMachineCards.map((card) => (
                <LiveCard key={card.id} card={card} agoraMs={agoraMs} />
              ))}
              {liveTankCards.map((card) => (
                <LiveCard key={card.id} card={card} agoraMs={agoraMs} />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Top operadores</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Melhores índices do período</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ranking por taxa no prazo, eficiência e volume operado.
            </p>

            <div className="mt-5 space-y-3">
              {desempenhoOperadores.slice(0, 5).map((operador, index) => (
                <div key={operador.operatorName} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{operador.operatorName}</div>
                        <div className="text-sm text-slate-500">
                          {operador.completedOrders} concluídas · {formatarNumero(operador.outputLiters, 2)} L
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wide text-slate-400">No prazo</div>
                      <div className="text-lg font-semibold text-slate-900">{formatarNumero(operador.onTimeRate)}%</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Tempo médio</div>
                      <div className="mt-1 font-medium text-slate-900">{formatarMinutos(operador.averageCycleMinutes)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Eficiência</div>
                      <div className="mt-1 font-medium text-slate-900">{formatarNumero(operador.efficiencyRate)}%</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Pausas</div>
                      <div className="mt-1 font-medium text-slate-900">
                        {operador.pauseEvents} · {formatarMinutos(operador.pauseMinutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Desvio médio</div>
                      <div className="mt-1 font-medium text-slate-900">{formatarMinutos(operador.averageDelayMinutes)}</div>
                    </div>
                  </div>
                </div>
              ))}

              {desempenhoOperadores.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Ainda não há operadores suficientes com ordens registradas no período.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Performance</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Desempenho das máquinas</h2>
              <p className="mt-1 text-sm text-slate-500">
                Tempo médio, ocupação, volume processado e quanto cada máquina ficou parada.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {desempenhoMaquinas.map((maquina) => (
              <article key={maquina.machineId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Envase</div>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">{maquina.machineName}</h3>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                    {formatarNumero(maquina.utilizationRate)}% ocupação
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Ordens concluídas</div>
                    <div className="mt-1 font-semibold text-slate-900">{maquina.completedOrders}</div>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Volume</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatarNumero(maquina.outputLiters, 2)} L</div>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Tempo médio</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatarMinutos(maquina.averageCycleMinutes)}</div>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-slate-400">No prazo</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatarNumero(maquina.onTimeRate)}%</div>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>Produzindo no período</span>
                    <span className="font-medium text-slate-900">{formatarMinutos(maquina.actualMinutes)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Pausada no período</span>
                    <span className="font-medium text-slate-900">{formatarMinutos(maquina.pauseMinutes)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Sem produção no período</span>
                    <span className="font-medium text-slate-900">{formatarMinutos(maquina.idleMinutes)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Desvio médio</span>
                    <span className="font-medium text-slate-900">{formatarMinutos(maquina.averageDelayMinutes)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Operadores</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Desempenho detalhado por operador</h2>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Operador</th>
                    <th className="px-3 py-3 text-right">Concluídas</th>
                    <th className="px-3 py-3 text-right">Ativas</th>
                    <th className="px-3 py-3 text-right">Litros</th>
                    <th className="px-3 py-3 text-right">Tempo médio</th>
                    <th className="px-3 py-3 text-right">No prazo</th>
                    <th className="px-3 py-3 text-right">Pausas</th>
                    <th className="px-3 py-3 text-right">Eficiência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {desempenhoOperadores.map((operador) => (
                    <tr key={operador.operatorName}>
                      <td className="px-3 py-3 font-medium text-slate-900">{operador.operatorName}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{operador.completedOrders}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{operador.activeOrders}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{formatarNumero(operador.outputLiters, 2)} L</td>
                      <td className="px-3 py-3 text-right text-slate-700">{formatarMinutos(operador.averageCycleMinutes)}</td>
                      <td className="px-3 py-3 text-right font-medium text-slate-900">{formatarNumero(operador.onTimeRate)}%</td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {operador.pauseEvents} · {formatarMinutos(operador.pauseMinutes)}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">{formatarNumero(operador.efficiencyRate)}%</td>
                    </tr>
                  ))}
                  {desempenhoOperadores.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                        Nenhum operador encontrado no período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Produtos</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Média real por produto</h2>
            </div>

            <div className="mt-5 space-y-3">
              {mediasProduto.slice(0, 8).map((media) => (
                <div key={media.produtoSku} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{media.produtoNome}</div>
                      <div className="text-sm text-slate-500">{media.produtoSku}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wide text-slate-400">Ciclo médio</div>
                      <div className="font-semibold text-slate-900">{formatarMinutos(media.tempoMedioMin)}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Ordens</div>
                      <div className="mt-1 font-medium text-slate-900">{media.ordensConcluidas}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Melhor</div>
                      <div className="mt-1 font-medium text-emerald-700">{formatarMinutos(media.tempoMinMin)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Pior</div>
                      <div className="mt-1 font-medium text-rose-700">{formatarMinutos(media.tempoMaxMin)}</div>
                    </div>
                  </div>
                </div>
              ))}

              {mediasProduto.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Ainda não existem ordens concluídas suficientes para calcular médias de produto.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Histórico</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Rastro de ordens do período</h2>
              <p className="mt-1 text-sm text-slate-500">
                O que foi produzido, o que ainda está em andamento e a diferença entre planejado e real.
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {historyRows.length} ordens no recorte
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">Ordem</th>
                  <th className="px-3 py-3">Etapa</th>
                  <th className="px-3 py-3">Recurso</th>
                  <th className="px-3 py-3">Produto</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Operador</th>
                  <th className="px-3 py-3">Planejado</th>
                  <th className="px-3 py-3">Real</th>
                  <th className="px-3 py-3">Volume</th>
                  <th className="px-3 py-3">Desvio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyRows.map((ordem) => {
                  const plannedMinutes = Number(ordem.total_duration_minutes ?? 0)
                  const actualMinutes = obterTempoProducaoMin(ordem, agoraMs)
                  const delayMinutes = Math.max(actualMinutes - plannedMinutes, 0)

                  return (
                    <tr key={ordem.id}>
                      <td className="px-3 py-3 font-medium text-slate-900">#{ordem.numero_externo}</td>
                      <td className="px-3 py-3 capitalize text-slate-700">{ordem.etapa}</td>
                      <td className="px-3 py-3 text-slate-700">{getHistoryResource(ordem)}</td>
                      <td className="px-3 py-3 text-slate-700">{ordem.produto?.nome ?? ordem.produto_sku ?? '--'}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(ordem)}`}>
                          {statusLabel(ordem)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{ordem.operador_nome ?? '--'}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatarDataHora(ordem.inicio_agendado)} · {formatarMinutos(plannedMinutes)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatarDataHora(ordem.inicio_operacao_em)} / {formatarDataHora(ordem.fim_operacao_em)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{formatarNumero(obterQuantidadeProduzidaEstimada(ordem, agoraMs), 2)} L</td>
                      <td className="px-3 py-3 text-slate-700">
                        {actualMinutes > 0 ? formatarMinutos(delayMinutes) : '--'}
                      </td>
                    </tr>
                  )
                })}
                {historyRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-slate-400">
                      Nenhuma ordem encontrada no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
