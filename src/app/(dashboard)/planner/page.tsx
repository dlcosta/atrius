'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Maquina, Operador, Ordem, Produto } from '@/types'
import { NovaOrdemForm } from '@/components/planner/NovaOrdemForm'
import { OperacaoDashboard } from '@/components/planner/OperacaoDashboard'
import { OperacaoTvPanel } from '@/components/planner/OperacaoTvPanel'
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
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const [mensagem, setMensagem] = useState('')
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
      const [mRes, oRes, pRes, operadoresRes] = await Promise.all([
        fetch('/api/maquinas'),
        fetch(`/api/ordens?data=${dataStr}`),
        fetch('/api/produtos'),
        fetch('/api/operadores?ativos=1'),
      ])

      const [m, o, p, operadoresData] = await Promise.all([
        mRes.json(),
        oRes.json(),
        pRes.json(),
        operadoresRes.json(),
      ])

      if (!mRes.ok) throw new Error(m?.error ?? 'Erro ao carregar máquinas')
      if (!oRes.ok) throw new Error(o?.error ?? 'Erro ao carregar ordens')
      if (!pRes.ok) throw new Error(p?.error ?? 'Erro ao carregar produtos')
      if (!operadoresRes.ok) throw new Error(operadoresData?.error ?? 'Erro ao carregar operadores')

      setMaquinas(Array.isArray(m) ? m : [])
      setOrdens(Array.isArray(o) ? o : [])
      setProdutos(Array.isArray(p) ? p : [])
      setOperadores(Array.isArray(operadoresData) ? operadoresData : [])

      if (o?.error) {
        setMensagem(o.error)
      }
    } catch {
      setMensagem('Erro ao carregar dados. Verifique a conexão.')
    }
  }, [dia])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

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

  async function sincronizar() {
    setSincronizando(true)
    setMensagem('')

    try {
      const res = await fetch('/api/sincronizar', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        setMensagem(`Sincronizado: ${data.importadas} ordens importadas, ${data.erros} erros.`)
        await carregarDados()
      } else {
        setMensagem(data.error ?? 'Erro na sincronização com a API externa.')
      }
    } catch {
      setMensagem('Erro de rede ao sincronizar.')
    }

    setSincronizando(false)
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
      setMensagem('Selecione um operador para esse recurso antes de registrar a operação.')
      return
    }

    setExecutandoOrdemId(ordem.id)
    setMensagem('')
    try {
      const res = await fetch('/api/ordens/operacao', {
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
        setMensagem(data.error ?? 'Não foi possível registrar a operação.')
      } else {
        const mensagens: Record<typeof acao, string> = {
          iniciar: 'Operação iniciada com sucesso.',
          pausar: 'Operação pausada com sucesso.',
          retomar: 'Operação retomada com sucesso.',
          finalizar: 'Operação finalizada com sucesso.',
        }
        setMensagem(mensagens[acao])
      }
    } catch {
      setMensagem('Erro de rede ao registrar operação.')
    } finally {
      setExecutandoOrdemId(null)
    }

    await carregarDados()
  }

  async function solicitarAcaoOperacao(ordem: Ordem, acao: AcaoOperacao) {
    if (!obterOperadorSelecionado(ordem)) {
      setMensagem('Selecione um operador para esse recurso antes de registrar a operação.')
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
      setMensagem('Informe a observação da pausa antes de continuar.')
      return
    }

    await executarAcaoOperacao(pausaAberta.ordem, 'pausar', { observacaoPausa: observacao })
    setPausaAberta(null)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="relative z-10 space-y-4 border-b border-[#E4E7EC] bg-white p-4">
        <div className="flex items-start gap-4">
          <div>
            <h1 className="text-[22px] font-semibold leading-tight text-[#111827]">Painel de Controle Atrius</h1>
            <p className="mt-1 text-[13px] text-[#9CA3AF]">Monitoramento e Gestão de Produção em Tempo Real</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(true)}
              className="h-9 rounded-[8px] border border-[#CDD2DA] bg-white px-4 text-sm font-medium text-[#4B5563] hover:border-[#2563EB] hover:text-[#2563EB]"
            >
              Expandir Painel
            </button>
            <button
              onClick={sincronizar}
              disabled={sincronizando}
              className="h-9 rounded-[8px] bg-[#2563EB] px-4 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
            >
              {sincronizando ? 'Sincronizando...' : 'Sincronizar API'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-[8px] border border-[#E4E7EC] bg-white p-1">
            <button
              onClick={() => setDia((d) => subDays(d, 1))}
              className="grid h-8 w-8 place-items-center rounded-[6px] text-[#4B5563] hover:bg-[#F0F2F5]"
              title="Dia anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="w-56 px-2 text-center text-sm font-medium text-[#111827]">
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
            className="h-8 rounded-[8px] border border-[#2563EB] bg-white px-3 text-sm font-medium text-[#2563EB] hover:bg-[#EFF6FF]"
          >
            Hoje
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-[8px] bg-[#F0F2F5] p-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[#4B5563]">Turno</label>
            <select
              value={turnoSelecionado}
              onChange={(e) => aplicarPresetTurno(e.target.value)}
              className="h-9 min-w-52 rounded-[8px] border-0 bg-white px-3 text-sm text-[#111827]"
            >
              {TURNOS_PRESET.map((turno) => (
                <option key={turno.id} value={turno.id}>
                  {turno.label}
                </option>
              ))}
              <option value="custom">Personalizado</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[#4B5563]">Início</label>
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
              className="h-9 rounded-[8px] border-0 bg-white px-3 text-sm text-[#111827]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[#4B5563]">Fim</label>
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
              className="h-9 rounded-[8px] border-0 bg-white px-3 text-sm text-[#111827]"
            />
          </div>

          <span className="inline-flex h-9 items-center rounded-[12px] bg-[#EFF6FF] px-3 text-xs font-medium text-[#2563EB]">
            Janela ativa: {horaParaInput(janela.startHour)} - {horaParaInput(janela.endHour % 24 === 0 ? 0 : janela.endHour)}
          </span>

          <span className="inline-flex h-9 items-center rounded-[12px] bg-white px-3 text-xs font-medium text-[#475467]">
            Operadores ativos: {operadores.length}
          </span>

          <span className="inline-flex h-9 items-center rounded-[12px] bg-white px-3 text-xs text-[#667085]">
            Selecione o operador diretamente em cada máquina ou tanque antes de iniciar, pausar, retomar ou concluir.
          </span>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-[#E4E7EC] pt-4">
          <div className="min-w-32 rounded-[8px] border border-[#E4E7EC] bg-white p-4">
            <span className="block text-[10px] uppercase tracking-[0.08em] text-[#9CA3AF]">TOTAL</span>
            <span className="mt-2 block font-mono text-4xl font-semibold leading-none text-[#111827]">{resumo.total}</span>
          </div>
          <div className="min-w-32 rounded-[8px] border border-[#E4E7EC] bg-white p-4">
            <span className="block text-[10px] uppercase tracking-[0.08em] text-[#9CA3AF]">TANQUE</span>
            <span className="mt-2 block font-mono text-4xl font-semibold leading-none text-[#2563EB]">{resumo.tanque}</span>
          </div>
          <div className="min-w-32 rounded-[8px] border border-[#E4E7EC] bg-white p-4">
            <span className="block text-[10px] uppercase tracking-[0.08em] text-[#9CA3AF]">ENVASE</span>
            <span className="mt-2 block font-mono text-4xl font-semibold leading-none text-[#2563EB]">{resumo.envase}</span>
          </div>
          <div className="min-w-32 rounded-[8px] border border-[#E4E7EC] bg-white p-4">
            <span className="block text-[10px] uppercase tracking-[0.08em] text-[#9CA3AF]">AGENDADAS</span>
            <span className="mt-2 block font-mono text-4xl font-semibold leading-none text-[#16A34A]">{resumo.agendadas}</span>
          </div>
          <div className="min-w-32 rounded-[8px] border border-[#E4E7EC] bg-white p-4">
            <span className="block text-[10px] uppercase tracking-[0.08em] text-[#9CA3AF]">CONCLUÍDAS</span>
            <span className="mt-2 block font-mono text-4xl font-semibold leading-none text-[#16A34A]">{resumo.concluidas}</span>
          </div>
        </div>
      </div>

      {mensagem && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">{mensagem}</div>
      )}

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
            operadores={operadores}
            ordens={ordens.filter((o) => o.inicio_agendado !== null)}
            executandoOrdemId={executandoOrdemId}
            operadorPorRecurso={operadorPorRecurso}
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
