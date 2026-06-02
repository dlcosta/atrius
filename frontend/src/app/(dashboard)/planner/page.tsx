'use client'
import { apiUrl } from '@/lib/api'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Maquina, Operador, Ordem, Produto, Tanque } from '@/types'
import { NovaOrdemForm } from '@/components/planner/NovaOrdemForm'
import { OperacaoDashboard } from '@/components/planner/OperacaoDashboard'
import { OperacaoTvPanel } from '@/components/planner/OperacaoTvPanel'
import { toast } from '@/lib/ui/toast'
import {
  DEFAULT_JANELA_PRODUCAO,
  JanelaProducao,
  sanitizarJanelaProducao,
} from '@/lib/planning/gantt-layout'

const OPERADORES_RECURSO_STORAGE_KEY = 'atrius:planner:operadores-por-recurso'

type AcaoOperacao = 'iniciar' | 'pausar' | 'retomar' | 'finalizar'
type OperadorPorRecurso = Record<string, string>

type TurnoPreset = {
  id: string
  label: string
  startHour: number
  endHour: number
}

const TURNOS_PRESET: TurnoPreset[] = [
  { id: 'comercial', label: 'Comercial (07h-18h)', startHour: 7, endHour: 18 },
  { id: 'turno1', label: 'Turno 1 (06h-14h)', startHour: 6, endHour: 14 },
  { id: 'turno2', label: 'Turno 2 (14h-22h)', startHour: 14, endHour: 22 },
  { id: 'dia', label: 'Dia inteiro (06h-22h)', startHour: 6, endHour: 22 },
]

const JANELA_STORAGE_KEY = 'atrius:planner:janela-producao'

function horaParaInput(hora: number): string {
  return `${String(hora).padStart(2, '0')}:00`
}

function inputParaHora(valor: string, fallback: number): number {
  const hora = Number(valor.split(':')[0])
  if (Number.isNaN(hora)) return fallback
  return hora
}

function detectarPreset(janela: JanelaProducao): string {
  const encontrado = TURNOS_PRESET.find(
    (preset) => preset.startHour === janela.startHour && preset.endHour === janela.endHour
  )
  return encontrado?.id ?? 'custom'
}

function getRecursoKey(ordem: Ordem): string | null {
  if (ordem.etapa === 'envase') {
    return ordem.maquina_id ? `machine:${ordem.maquina_id}` : null
  }
  return ordem.tank_id ? `tank:${ordem.tank_id}` : null
}

export default function PlannerPage() {
  const [dia, setDia] = useState<Date>(() => new Date())
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [agoraMs, setAgoraMs] = useState<number>(0)
  const [novaOrdemAberta, setNovaOrdemAberta] = useState(false)
  const [executandoOrdemId, setExecutandoOrdemId] = useState<string | null>(null)
  const [operadorPorRecurso, setOperadorPorRecurso] = useState<OperadorPorRecurso>({})
  const [pausaAberta, setPausaAberta] = useState<{ ordem: Ordem; observacao: string } | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [janela, setJanela] = useState<JanelaProducao>(DEFAULT_JANELA_PRODUCAO)
  const [turnoSelecionado, setTurnoSelecionado] = useState<string>(() => detectarPreset(DEFAULT_JANELA_PRODUCAO))

  const carregarDados = useCallback(async () => {
    try {
      const dataStr = format(dia, 'yyyy-MM-dd')
      const [mRes, tRes, oRes, pRes, operadoresRes] = await Promise.all([
        fetch(apiUrl('/api/maquinas')),
        fetch(apiUrl('/api/tanques?ativos=1')),
        fetch(apiUrl(`/api/ordens?data=${dataStr}`)),
        fetch(apiUrl('/api/produtos')),
        fetch(apiUrl('/api/operadores?ativos=1')),
      ])

      const [m, t, o, p, operadoresData] = await Promise.all([
        mRes.json(),
        tRes.json(),
        oRes.json(),
        pRes.json(),
        operadoresRes.json(),
      ])

      if (!mRes.ok) throw new Error(m?.error ?? 'Erro ao carregar máquinas')
      if (!oRes.ok) throw new Error(o?.error ?? 'Erro ao carregar ordens')
      if (!pRes.ok) throw new Error(p?.error ?? 'Erro ao carregar produtos')
      if (!operadoresRes.ok) throw new Error(operadoresData?.error ?? 'Erro ao carregar operadores')

      setMaquinas(Array.isArray(m) ? m : [])
      setTanques(Array.isArray(t) ? t : [])
      setOrdens(Array.isArray(o) ? o : [])
      setProdutos(Array.isArray(p) ? p : [])
      setOperadores(Array.isArray(operadoresData) ? operadoresData : [])

      if (o?.error) {
        toast.error(o.error)
      }
    } catch {
      toast.error('Erro ao carregar dados. Verifique a conexão.')
    }
  }, [dia])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  useEffect(() => {
    setAgoraMs(Date.now())
    const clock = setInterval(() => setAgoraMs(Date.now()), 1000)
    return () => clearInterval(clock)
  }, [])

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(JANELA_STORAGE_KEY)
      if (!salvo) return

      const parsed = JSON.parse(salvo) as Partial<JanelaProducao>
      const normalizada = sanitizarJanelaProducao(parsed)
      setJanela(normalizada)
      setTurnoSelecionado(detectarPreset(normalizada))
    } catch {
      // usa padrao caso localStorage esteja invalido
    }
    try {
      const operadoresSalvos = localStorage.getItem(OPERADORES_RECURSO_STORAGE_KEY)
      if (operadoresSalvos) {
        const parsed = JSON.parse(operadoresSalvos) as OperadorPorRecurso
        if (parsed && typeof parsed === 'object') setOperadorPorRecurso(parsed)
      }
    } catch {
      // ignora mapa invalido
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(JANELA_STORAGE_KEY, JSON.stringify(janela))
  }, [janela])

  useEffect(() => {
    localStorage.setItem(OPERADORES_RECURSO_STORAGE_KEY, JSON.stringify(operadorPorRecurso))
  }, [operadorPorRecurso])

  const resumo = useMemo(() => {
    const total = ordens.length
    const tanque = ordens.filter((o) => o.etapa === 'tanque').length
    const envase = ordens.filter((o) => o.etapa === 'envase').length
    const agendadas = ordens.filter((o) => o.inicio_agendado !== null).length
    const concluidas = ordens.filter((o) => o.status === 'concluida').length
    return { total, tanque, envase, agendadas, concluidas }
  }, [ordens])

  function atualizarJanela(proxima: Partial<JanelaProducao>) {
    const normalizada = sanitizarJanelaProducao({ ...janela, ...proxima })
    setJanela(normalizada)
    setTurnoSelecionado(detectarPreset(normalizada))
  }

  function aplicarPresetTurno(id: string) {
    setTurnoSelecionado(id)
    if (id === 'custom') return

    const preset = TURNOS_PRESET.find((item) => item.id === id)
    if (!preset) return

    atualizarJanela({ startHour: preset.startHour, endHour: preset.endHour })
  }

  function selecionarOperadorParaRecurso(recursoKey: string, operadorId: string) {
    setOperadorPorRecurso((atual) => ({
      ...atual,
      [recursoKey]: operadorId,
    }))
  }

  function obterOperadorSelecionado(ordem: Ordem) {
    const recursoKey = getRecursoKey(ordem)
    if (!recursoKey) return null

    const operadorId = operadorPorRecurso[recursoKey]
    if (!operadorId) return null
    return operadores.find((operador) => operador.id === operadorId) ?? null
  }

  async function executarAcaoOperacao(
    ordem: Ordem,
    acao: AcaoOperacao,
    options?: { observacaoPausa?: string | null }
  ) {
    const operador = obterOperadorSelecionado(ordem)
    if (!operador) {
      toast.warning('Selecione um operador para esse recurso antes de registrar a operação.')
      return
    }

    setExecutandoOrdemId(ordem.id)
    try {
      const res = await fetch(apiUrl('/api/ordens/operacao'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordem_id: ordem.id,
          acao,
          operador_id: operador.id,
          operador_nome: operador.nome,
          observacao_pausa: options?.observacaoPausa ?? undefined,
          flow_source: ordem.flow_source ?? 'legado',
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Não foi possível registrar a operação.')
      } else {
        const mensagens: Record<typeof acao, string> = {
          iniciar: 'Operação iniciada com sucesso.',
          pausar: 'Operação pausada com sucesso.',
          retomar: 'Operação retomada com sucesso.',
          finalizar: 'Operação finalizada com sucesso.',
        }
        toast.success(mensagens[acao])
      }
    } catch {
      toast.error('Erro de rede ao registrar operação.')
    } finally {
      setExecutandoOrdemId(null)
    }

    await carregarDados()
  }

  async function solicitarAcaoOperacao(ordem: Ordem, acao: AcaoOperacao) {
    if (!obterOperadorSelecionado(ordem)) {
      toast.warning('Selecione um operador para esse recurso antes de registrar a operação.')
      return
    }

    if (acao === 'pausar') {
      setPausaAberta({ ordem, observacao: '' })
      return
    }

    await executarAcaoOperacao(ordem, acao)
  }

  async function confirmarPausa() {
    if (!pausaAberta) return

    const observacao = pausaAberta.observacao.trim()
    if (!observacao) {
      toast.warning('Informe a observação da pausa antes de continuar.')
      return
    }

    await executarAcaoOperacao(pausaAberta.ordem, 'pausar', { observacaoPausa: observacao })
    setPausaAberta(null)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F7F8FA]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative z-10 border-b border-[#E4E7EC] bg-white px-5 py-4">

        {/* Linha 1: título + relógio + botões */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-bold leading-tight text-[#111827]">
              Painel de Operação
            </h1>
            <p className="mt-0.5 text-[12px] text-[#9CA3AF]">
              Gerencie ordens ao vivo — selecione o operador em cada recurso antes de iniciar.
            </p>
          </div>

          {/* Relógio ao vivo */}
          <div className="flex items-center gap-2 rounded-[10px] border border-[#E4E7EC] bg-[#F7F8FA] px-3 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span className="font-mono text-[15px] font-semibold text-[#111827]">
              {agoraMs ? format(new Date(agoraMs), 'HH:mm:ss', { locale: ptBR }) : '--:--:--'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(true)}
              className="h-9 rounded-[8px] border border-[#CDD2DA] bg-white px-4 text-[13px] font-medium text-[#4B5563] hover:border-[#2563EB] hover:text-[#2563EB]"
            >
              Modo TV
            </button>
          </div>
        </div>

        {/* Linha 2: data + turno + operadores */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {/* Navegação de data */}
          <div className="flex items-center rounded-[8px] border border-[#E4E7EC] bg-white p-1">
            <button
              onClick={() => setDia((d) => subDays(d, 1))}
              className="grid h-8 w-8 place-items-center rounded-[6px] text-[#4B5563] hover:bg-[#F0F2F5]"
              title="Dia anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="w-52 px-2 text-center text-[14px] font-semibold text-[#111827]">
              {format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </span>
            <button
              onClick={() => setDia((d) => addDays(d, 1))}
              className="grid h-8 w-8 place-items-center rounded-[6px] text-[#4B5563] hover:bg-[#F0F2F5]"
              title="Próximo dia"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            onClick={() => setDia(new Date())}
            className="h-9 rounded-[8px] border border-[#2563EB] bg-white px-4 text-[13px] font-semibold text-[#2563EB] hover:bg-[#EFF6FF]"
          >
            Hoje
          </button>

          {/* Turno */}
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-semibold text-[#4B5563]">Turno:</label>
            <select
              value={turnoSelecionado}
              onChange={(e) => aplicarPresetTurno(e.target.value)}
              className="h-9 min-w-48 rounded-[8px] border border-[#E4E7EC] bg-white px-3 text-[13px] text-[#111827]"
            >
              {TURNOS_PRESET.map((turno) => (
                <option key={turno.id} value={turno.id}>
                  {turno.label}
                </option>
              ))}
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {/* Hora início/fim (turno personalizado) */}
          {turnoSelecionado === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="time"
                step={3600}
                value={horaParaInput(janela.startHour)}
                onChange={(e) => {
                  const hora = inputParaHora(e.target.value, janela.startHour)
                  const normalizada = sanitizarJanelaProducao({ ...janela, startHour: hora })
                  setJanela(normalizada)
                  setTurnoSelecionado(detectarPreset(normalizada))
                }}
                className="h-9 rounded-[8px] border border-[#E4E7EC] bg-white px-3 text-[13px] text-[#111827]"
              />
              <span className="text-[12px] text-[#9CA3AF]">até</span>
              <input
                type="time"
                step={3600}
                value={horaParaInput(janela.endHour % 24 === 0 ? 0 : janela.endHour)}
                onChange={(e) => {
                  const hora = inputParaHora(e.target.value, janela.endHour)
                  const normalizada = sanitizarJanelaProducao({ ...janela, endHour: hora === 0 ? 24 : hora })
                  setJanela(normalizada)
                  setTurnoSelecionado(detectarPreset(normalizada))
                }}
                className="h-9 rounded-[8px] border border-[#E4E7EC] bg-white px-3 text-[13px] text-[#111827]"
              />
            </div>
          )}

          {/* Operadores ativos */}
          <span className="ml-auto rounded-full bg-[#F0F2F5] px-3 py-1.5 text-[12px] font-medium text-[#475467]">
            {operadores.length} operador{operadores.length !== 1 ? 'es' : ''} disponível{operadores.length !== 1 ? 'eis' : ''}
          </span>
        </div>

        {/* Linha 3: KPIs */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#E4E7EC] pt-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-[10px] border border-[#E4E7EC] bg-white px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Total do dia</div>
            <div className="mt-1.5 font-mono text-[28px] font-bold leading-none text-[#111827]">{resumo.total}</div>
          </div>
          <div className="rounded-[10px] border border-[#E4E7EC] bg-white px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Tanques</div>
            <div className="mt-1.5 font-mono text-[28px] font-bold leading-none text-[#2563EB]">{resumo.tanque}</div>
          </div>
          <div className="rounded-[10px] border border-[#E4E7EC] bg-white px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Envase</div>
            <div className="mt-1.5 font-mono text-[28px] font-bold leading-none text-[#2563EB]">{resumo.envase}</div>
          </div>
          <div className="rounded-[10px] border border-[#E4E7EC] bg-[#F0FDF4] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Agendadas</div>
            <div className="mt-1.5 font-mono text-[28px] font-bold leading-none text-[#16A34A]">{resumo.agendadas}</div>
          </div>
          <div className="rounded-[10px] border border-[#E4E7EC] bg-[#F0FDF4] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Concluídas</div>
            <div className="mt-1.5 font-mono text-[28px] font-bold leading-none text-[#16A34A]">{resumo.concluidas}</div>
          </div>
        </div>
      </div>
      {novaOrdemAberta && (
        <NovaOrdemForm
          produtos={produtos}
          dataInicial={dia}
          onSalvo={() => {
            setNovaOrdemAberta(false)
            carregarDados()
          }}
          onFechar={() => setNovaOrdemAberta(false)}
        />
      )}

      <main className="flex-1 space-y-4 overflow-y-auto p-4">
        {isExpanded ? (
          <OperacaoTvPanel
            maquinas={maquinas}
            operadores={operadores}
            ordens={ordens.filter((o) => o.inicio_agendado !== null)}
            executandoOrdemId={executandoOrdemId}
            operadorPorRecurso={operadorPorRecurso}
            dia={dia}
            janela={janela}
            onNavigateDay={(acao) => {
              if (acao === 'prev') {
                setDia((d) => subDays(d, 1))
                return
              }
              if (acao === 'next') {
                setDia((d) => addDays(d, 1))
                return
              }
              setDia(new Date())
            }}
            onExit={() => setIsExpanded(false)}
            onSelecionarOperador={selecionarOperadorParaRecurso}
            onAcao={solicitarAcaoOperacao}
          />
        ) : (
          <OperacaoDashboard
            maquinas={maquinas}
            tanques={tanques}
            operadores={operadores}
            ordens={ordens.filter((o) => o.inicio_agendado !== null)}
            executandoOrdemId={executandoOrdemId}
            operadorPorRecurso={operadorPorRecurso}
            agoraMs={agoraMs}
            onSelecionarOperador={selecionarOperadorParaRecurso}
            onAcao={solicitarAcaoOperacao}
          />
        )}
      </main>

      {pausaAberta && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-lg rounded-[16px] bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-[#111827]">Registrar pausa</h2>
            <p className="mt-2 text-sm text-[#667085]">
              Informe o motivo da pausa para a ordem <span className="font-semibold">#{pausaAberta.ordem.numero_externo}</span>.
            </p>

            <textarea
              value={pausaAberta.observacao}
              onChange={(e) => setPausaAberta((atual) => (atual ? { ...atual, observacao: e.target.value } : atual))}
              placeholder="Descreva o motivo da parada"
              rows={5}
              className="mt-4 w-full rounded-[12px] border border-[#D0D5DD] px-3 py-2 text-sm text-[#111827]"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPausaAberta(null)}
                className="rounded-[10px] border border-[#D0D5DD] px-4 py-2 text-sm font-medium text-[#475467]"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarPausa}
                className="rounded-[10px] bg-[#D97706] px-4 py-2 text-sm font-semibold text-white"
              >
                Confirmar pausa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
