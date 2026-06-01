import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Droplets,
  FlaskConical,
  Pause,
  Play,
  RotateCcw,
  User,
} from 'lucide-react'
import type { Maquina, Operador, Ordem, Tanque } from '@/types'

type AcaoOperacao = 'iniciar' | 'pausar' | 'retomar' | 'finalizar'

type ResourceGroup = {
  id: string
  nome: string
  tipo: 'maquina' | 'tanque'
  capacidadeLitros?: number
  ordens: Ordem[]
}

type Props = {
  maquinas: Maquina[]
  tanques: Tanque[]
  operadores: Operador[]
  ordens: Ordem[]
  executandoOrdemId: string | null
  operadorPorRecurso: Record<string, string>
  agoraMs: number
  onSelecionarOperador: (recursoKey: string, operadorId: string) => void
  onAcao: (ordem: Ordem, acao: AcaoOperacao) => Promise<void>
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function segParaRelogio(totalSeg: number): string {
  const s = totalSeg % 60
  const m = Math.floor((totalSeg % 3600) / 60)
  const h = Math.floor(totalSeg / 3600)
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function formatarRestante(ordem: Ordem, agoraMs: number): string {
  if (ordem.status === 'pausada' && ordem.tempo_restante_pausado_seg) {
    return segParaRelogio(Math.max(0, ordem.tempo_restante_pausado_seg))
  }
  if (!ordem.fim_calculado) return '--:--:--'
  const ms = Math.max(0, new Date(ordem.fim_calculado).getTime() - agoraMs)
  return segParaRelogio(Math.floor(ms / 1000))
}

function formatarDecorrido(ordem: Ordem, agoraMs: number): string {
  if (!ordem.inicio_operacao_em) return '--:--:--'
  const ms = Math.max(0, agoraMs - new Date(ordem.inicio_operacao_em).getTime())
  return segParaRelogio(Math.floor(ms / 1000))
}

function calcularProgresso(ordem: Ordem, agoraMs: number): number {
  const inicioStr = ordem.inicio_operacao_em ?? ordem.inicio_agendado
  if (!inicioStr || !ordem.fim_calculado) return 0
  const inicio = new Date(inicioStr).getTime()
  const fim = new Date(ordem.fim_calculado).getTime()
  const total = fim - inicio
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, ((agoraMs - inicio) / total) * 100))
}

function formatarHora(dataIso: string | null | undefined): string {
  if (!dataIso) return '--:--'
  return format(new Date(dataIso), 'HH:mm', { locale: ptBR })
}

function labelStatus(ordem: Ordem): string {
  if (ordem.status === 'produzindo') return 'Em andamento'
  if (ordem.status === 'pausada') return 'Pausada'
  if (ordem.status === 'concluida') return 'Concluída'
  if (ordem.planning_status === 'WAITING_TANK') return 'Aguard. tanque'
  return 'Programada'
}

function getRecursoKey(tipo: 'maquina' | 'tanque', id: string) {
  return tipo === 'maquina' ? `machine:${id}` : `tank:${id}`
}

function ordenarOrdens(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    const aT = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bT = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    return aT - bT
  })
}

function montarGrupos(maquinas: Maquina[], tanques: Tanque[], ordens: Ordem[]): ResourceGroup[] {
  const gruposMaquina = maquinas
    .filter((m) => m.ativa)
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      tipo: 'maquina' as const,
      ordens: ordenarOrdens(ordens.filter((o) => o.maquina_id === m.id && o.inicio_agendado)),
    }))

  const tanqueIdsConhecidos = new Set(tanques.map((t) => t.id))

  const gruposTanque = tanques
    .filter((t) => t.ativo)
    .map((t) => ({
      id: t.id,
      nome: t.nome,
      tipo: 'tanque' as const,
      capacidadeLitros: t.volume_liters,
      ordens: ordenarOrdens(
        ordens.filter(
          (o) =>
            o.etapa === 'tanque' &&
            o.inicio_agendado &&
            (o.tank_id === t.id || o.tanque === t.nome),
        ),
      ),
    }))

  // Tanques órfãos (ordens sem tank_id conhecido)
  const mapExtras = new Map<string, ResourceGroup>()
  ordens
    .filter(
      (o) =>
        o.etapa === 'tanque' &&
        o.inicio_agendado &&
        (!o.tank_id || !tanqueIdsConhecidos.has(o.tank_id)),
    )
    .forEach((o, i) => {
      const key = o.tank_id ?? o.tanque ?? `extra-${i}`
      const nome = o.tanque_ref?.nome ?? o.tanque ?? `Tanque ${i + 1}`
      if (!mapExtras.has(key)) mapExtras.set(key, { id: key, nome, tipo: 'tanque', ordens: [] })
      mapExtras.get(key)!.ordens.push(o)
    })
  const gruposExtras = Array.from(mapExtras.values()).map((g) => ({
    ...g,
    ordens: ordenarOrdens(g.ordens),
  }))

  return [...gruposMaquina, ...gruposTanque, ...gruposExtras]
}

// ─── Resource Card ───────────────────────────────────────────────────────────

function ResourceCard({
  grupo,
  operadores,
  executandoOrdemId,
  operadorPorRecurso,
  agoraMs,
  onSelecionarOperador,
  onAcao,
}: {
  grupo: ResourceGroup
  operadores: Operador[]
  executandoOrdemId: string | null
  operadorPorRecurso: Record<string, string>
  agoraMs: number
  onSelecionarOperador: (key: string, id: string) => void
  onAcao: (ordem: Ordem, acao: AcaoOperacao) => Promise<void>
}) {
  const recursoKey = getRecursoKey(grupo.tipo, grupo.id)
  const operadorId = operadorPorRecurso[recursoKey] ?? ''
  const semOperador = !operadorId

  const ordemAtiva = grupo.ordens.find((o) => o.status === 'produzindo' || o.status === 'pausada')
  const proximaDisponivel = !ordemAtiva
    ? grupo.ordens.find(
        (o) => o.status !== 'concluida' && o.planning_status !== 'WAITING_TANK',
      )
    : null
  const emFila = grupo.ordens.filter(
    (o) => o.status !== 'concluida' && o.id !== ordemAtiva?.id,
  ).length

  const estadoCard: 'producao' | 'pausada' | 'aguardando' | 'livre' = ordemAtiva
    ? ordemAtiva.status === 'produzindo'
      ? 'producao'
      : 'pausada'
    : grupo.ordens.some((o) => o.status !== 'concluida')
      ? 'aguardando'
      : 'livre'

  const barColor = {
    producao: 'bg-emerald-500',
    pausada: 'bg-amber-500',
    aguardando: 'bg-blue-400',
    livre: 'bg-slate-200',
  }[estadoCard]

  const IconRecurso = grupo.tipo === 'maquina' ? FlaskConical : Droplets
  const iconBg = grupo.tipo === 'maquina' ? 'bg-blue-100 text-blue-600' : 'bg-cyan-100 text-cyan-700'

  return (
    <div className="overflow-hidden rounded-[16px] border border-[#E4E7EC] bg-white shadow-sm">
      {/* Status accent bar */}
      <div className={`h-1.5 w-full ${barColor}`} />

      {/* Header */}
      <div className="border-b border-[#E4E7EC] px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}>
              <IconRecurso size={18} />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
                {grupo.tipo === 'maquina' ? 'Máquina' : 'Tanque'}
                {grupo.capacidadeLitros ? ` · ${grupo.capacidadeLitros.toLocaleString('pt-BR')} L` : ''}
              </div>
              <h3 className="text-[16px] font-bold leading-tight text-[#111827]">{grupo.nome}</h3>
            </div>
          </div>

          {/* Status badge */}
          {estadoCard === 'producao' && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Produzindo
            </span>
          )}
          {estadoCard === 'pausada' && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              <Pause size={11} />
              Pausada
            </span>
          )}
          {estadoCard === 'aguardando' && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
              <Clock size={11} />
              Aguardando
            </span>
          )}
          {estadoCard === 'livre' && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-400">
              Livre
            </span>
          )}
        </div>

        {/* Operator selector */}
        <div className="mt-3 flex items-center gap-2">
          <User size={14} className="shrink-0 text-[#9CA3AF]" />
          <select
            value={operadorId}
            onChange={(e) => onSelecionarOperador(recursoKey, e.target.value)}
            className={`flex-1 rounded-[8px] border py-2 pl-2.5 pr-2 text-[13px] text-[#111827] outline-none focus:ring-2 focus:ring-[#2563EB]/30 ${
              semOperador
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-[#D0D5DD] bg-white'
            }`}
          >
            <option value="">⚠ Selecione o operador...</option>
            {operadores.map((op) => (
              <option key={op.id} value={op.id}>
                {op.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active order */}
      {ordemAtiva && (
        <div className="px-4 pt-3 pb-4">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
            Ordem em andamento
          </div>

          <div className="mb-3">
            <div className="text-[15px] font-bold text-[#111827]">
              {ordemAtiva.produto?.nome ?? ordemAtiva.produto_sku ?? '—'}
            </div>
            <div className="mt-0.5 font-mono text-[12px] text-[#9CA3AF]">
              #{ordemAtiva.numero_externo}
              {ordemAtiva.lote ? ` · Lote ${ordemAtiva.lote}` : ''}
              {' · '}
              {ordemAtiva.quantidade} {ordemAtiva.unidade}
            </div>
          </div>

          {/* Live timer block */}
          <div
            className={`mb-3 rounded-[12px] border px-4 py-3 ${
              ordemAtiva.status === 'produzindo'
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
                  Decorrido
                </div>
                <div
                  className={`mt-1 font-mono text-[24px] font-bold tabular-nums ${
                    ordemAtiva.status === 'produzindo' ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {formatarDecorrido(ordemAtiva, agoraMs)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
                  {ordemAtiva.status === 'pausada' ? 'Rest. (pause)' : 'Restante'}
                </div>
                <div
                  className={`mt-1 font-mono text-[24px] font-bold tabular-nums ${
                    ordemAtiva.status === 'produzindo' ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {formatarRestante(ordemAtiva, agoraMs)}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10px] text-[#9CA3AF]">
                <span>Início: {formatarHora(ordemAtiva.inicio_operacao_em)}</span>
                <span className="font-semibold">
                  {Math.round(calcularProgresso(ordemAtiva, agoraMs))}%
                </span>
                <span>Prev.: {formatarHora(ordemAtiva.fim_calculado)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/60">
                <div
                  className={`h-full rounded-full ${
                    ordemAtiva.status === 'produzindo' ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${calcularProgresso(ordemAtiva, agoraMs)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Alertas */}
          {ordemAtiva.planning_status === 'WAITING_TANK' && (
            <div className="mb-3 flex items-start gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              Aguardando conclusão do tanque de origem.
            </div>
          )}
          {ordemAtiva.observacao_pausa && (
            <div className="mb-3 flex items-start gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <Pause size={13} className="mt-0.5 shrink-0" />
              Pausa: {ordemAtiva.observacao_pausa}
            </div>
          )}
          {semOperador && (
            <div className="mb-3 flex items-start gap-2 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              <User size={13} className="mt-0.5 shrink-0" />
              Selecione um operador acima para liberar as ações.
            </div>
          )}

          {/* Ações */}
          {(() => {
            const podeIniciar =
              ordemAtiva.status === 'aguardando' &&
              ordemAtiva.planning_status !== 'WAITING_TANK'
            const podePausar = ordemAtiva.status === 'produzindo'
            const podeRetomar = ordemAtiva.status === 'pausada'
            const podeFinalizar =
              ordemAtiva.status === 'produzindo' ||
              ordemAtiva.status === 'pausada' ||
              ordemAtiva.status === 'limpeza'
            const emExecucao = executandoOrdemId === ordemAtiva.id
            const temAcaoEsq = podeIniciar || podeRetomar || podePausar

            return (
              <div className="grid grid-cols-2 gap-2">
                {(podeIniciar || podeRetomar) && (
                  <button
                    onClick={() => onAcao(ordemAtiva, podeRetomar ? 'retomar' : 'iniciar')}
                    disabled={emExecucao || semOperador}
                    className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#2563EB] text-[13px] font-semibold text-white hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {podeRetomar ? <RotateCcw size={15} /> : <Play size={15} />}
                    {emExecucao ? 'Aguarde...' : podeRetomar ? 'Retomar' : 'Iniciar'}
                  </button>
                )}
                {podePausar && (
                  <button
                    onClick={() => onAcao(ordemAtiva, 'pausar')}
                    disabled={emExecucao || semOperador}
                    className="flex h-10 items-center justify-center gap-2 rounded-[10px] border-2 border-amber-400 bg-white text-[13px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                  >
                    <Pause size={15} />
                    {emExecucao ? 'Aguarde...' : 'Pausar'}
                  </button>
                )}
                {podeFinalizar && (
                  <button
                    onClick={() => onAcao(ordemAtiva, 'finalizar')}
                    disabled={emExecucao || semOperador}
                    className={`flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#CDD2DA] bg-white text-[13px] font-semibold text-[#4B5563] hover:bg-[#F0F2F5] disabled:opacity-40 ${
                      !temAcaoEsq ? 'col-span-2' : ''
                    }`}
                  >
                    <CheckCircle2 size={15} />
                    {emExecucao ? 'Aguarde...' : 'Concluir'}
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Sem ordem ativa → próxima ordem */}
      {!ordemAtiva && (
        <div className="px-4 py-4">
          {proximaDisponivel ? (
            <>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
                Próxima ordem
              </div>
              <div className="mb-3 rounded-[10px] border border-[#E4E7EC] bg-[#F7F8FA] px-4 py-3">
                <div className="text-[14px] font-bold text-[#111827]">
                  {proximaDisponivel.produto?.nome ?? proximaDisponivel.produto_sku ?? '—'}
                </div>
                <div className="mt-0.5 font-mono text-[12px] text-[#9CA3AF]">
                  #{proximaDisponivel.numero_externo} · Início: {formatarHora(proximaDisponivel.inicio_agendado)}
                </div>
              </div>

              {semOperador ? (
                <div className="flex items-start gap-2 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                  <User size={13} className="mt-0.5 shrink-0" />
                  Selecione um operador acima para iniciar.
                </div>
              ) : (
                <button
                  onClick={() => onAcao(proximaDisponivel, 'iniciar')}
                  disabled={executandoOrdemId === proximaDisponivel.id}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#2563EB] text-[13px] font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-40"
                >
                  <Play size={15} />
                  {executandoOrdemId === proximaDisponivel.id ? 'Iniciando...' : 'Iniciar'}
                </button>
              )}
            </>
          ) : (
            <div className="py-4 text-center text-[13px] text-[#9CA3AF]">
              Nenhuma ordem agendada para este{' '}
              {grupo.tipo === 'maquina' ? 'máquina' : 'tanque'} agora.
              {grupo.capacidadeLitros ? (
                <div className="mt-1 text-[11px] text-[#C9CDD6]">
                  Capacidade: {grupo.capacidadeLitros.toLocaleString('pt-BR')} L
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Fila footer */}
      {emFila > 0 && (
        <div className="border-t border-[#E4E7EC] px-4 py-2">
          <div className="text-[11px] text-[#9CA3AF]">
            +{emFila} {emFila === 1 ? 'ordem na fila' : 'ordens na fila'}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({
  titulo,
  subtitulo,
  grupos,
  operadores,
  executandoOrdemId,
  operadorPorRecurso,
  agoraMs,
  onSelecionarOperador,
  onAcao,
}: {
  titulo: string
  subtitulo: string
  grupos: ResourceGroup[]
  operadores: Operador[]
  executandoOrdemId: string | null
  operadorPorRecurso: Record<string, string>
  agoraMs: number
  onSelecionarOperador: (key: string, id: string) => void
  onAcao: (ordem: Ordem, acao: AcaoOperacao) => Promise<void>
}) {
  if (grupos.length === 0) return null

  const ativos = grupos.filter((g) =>
    g.ordens.some((o) => o.status === 'produzindo' || o.status === 'pausada'),
  ).length

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-[15px] font-bold text-[#111827]">{titulo}</h2>
          <p className="mt-0.5 text-[12px] text-[#9CA3AF]">{subtitulo}</p>
        </div>
        {ativos > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[12px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {ativos} produzindo
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {grupos.map((grupo) => (
          <ResourceCard
            key={grupo.id}
            grupo={grupo}
            operadores={operadores}
            executandoOrdemId={executandoOrdemId}
            operadorPorRecurso={operadorPorRecurso}
            agoraMs={agoraMs}
            onSelecionarOperador={onSelecionarOperador}
            onAcao={onAcao}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function OperacaoDashboard({
  maquinas,
  tanques,
  operadores,
  ordens,
  executandoOrdemId,
  operadorPorRecurso,
  agoraMs,
  onSelecionarOperador,
  onAcao,
}: Props) {
  const grupos = montarGrupos(maquinas, tanques, ordens)
  const gruposMaquina = grupos.filter((g) => g.tipo === 'maquina')
  const gruposTanque = grupos.filter((g) => g.tipo === 'tanque')

  const totalProduzindo = ordens.filter((o) => o.status === 'produzindo').length
  const totalPausada = ordens.filter((o) => o.status === 'pausada').length

  return (
    <section className="space-y-8 pb-4">
      {/* Cabeçalho do painel */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-[16px] font-bold text-[#111827]">Acompanhamento Operacional</h2>
          <p className="mt-0.5 text-[13px] text-[#9CA3AF]">
            Timers ao vivo · selecione o operador em cada recurso antes de iniciar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalProduzindo > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              {totalProduzindo} em produção
            </span>
          )}
          {totalPausada > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-[12px] font-semibold text-amber-700">
              <Pause size={12} />
              {totalPausada} pausada{totalPausada !== 1 ? 's' : ''}
            </span>
          )}
          {totalProduzindo === 0 && totalPausada === 0 && (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-medium text-slate-500">
              Sem ordens ativas agora
            </span>
          )}
        </div>
      </div>

      <Section
        titulo="Máquinas de Envase"
        subtitulo="Ordens agendadas hoje por máquina"
        grupos={gruposMaquina}
        operadores={operadores}
        executandoOrdemId={executandoOrdemId}
        operadorPorRecurso={operadorPorRecurso}
        agoraMs={agoraMs}
        onSelecionarOperador={onSelecionarOperador}
        onAcao={onAcao}
      />

      <Section
        titulo="Tanques de Produção"
        subtitulo="Ordens de tanque agendadas hoje"
        grupos={gruposTanque}
        operadores={operadores}
        executandoOrdemId={executandoOrdemId}
        operadorPorRecurso={operadorPorRecurso}
        agoraMs={agoraMs}
        onSelecionarOperador={onSelecionarOperador}
        onAcao={onAcao}
      />

      {grupos.length === 0 && (
        <div className="rounded-[12px] border border-dashed border-[#E4E7EC] bg-white px-6 py-12 text-center">
          <p className="text-[15px] text-[#9CA3AF]">Nenhum recurso configurado ou nenhuma ordem agendada para hoje.</p>
          <p className="mt-1 text-[13px] text-[#C9CDD6]">Acesse o Calendário para agendar ordens.</p>
        </div>
      )}
    </section>
  )
}
