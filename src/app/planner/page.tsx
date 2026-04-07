'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Maquina, Ordem, Produto, BlocoGantt } from '@/types'
import { GanttChart } from '@/components/planner/GanttChart'
import { OrdemSidebar } from '@/components/planner/OrdemSidebar'
import { NovaOrdemForm } from '@/components/planner/NovaOrdemForm'
import { OperacaoDashboard } from '@/components/planner/OperacaoDashboard'
import { ordemParaBlocos } from '@/lib/planning/engine'
import {
  DEFAULT_JANELA_PRODUCAO,
  JanelaProducao,
  sanitizarJanelaProducao,
} from '@/lib/planning/gantt-layout'

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

export default function PlannerPage() {
  const [dia, setDia] = useState<Date>(() => new Date())
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [novaOrdemAberta, setNovaOrdemAberta] = useState(false)
  const [executandoOrdemId, setExecutandoOrdemId] = useState<string | null>(null)
  const [janela, setJanela] = useState<JanelaProducao>(DEFAULT_JANELA_PRODUCAO)
  const [turnoSelecionado, setTurnoSelecionado] = useState<string>(() => detectarPreset(DEFAULT_JANELA_PRODUCAO))

  const carregarDados = useCallback(async () => {
    try {
      const dataStr = format(dia, 'yyyy-MM-dd')
      const [m, o, p] = await Promise.all([
        fetch('/api/maquinas').then((r) => r.json()),
        fetch(`/api/ordens?data=${dataStr}`).then((r) => r.json()),
        fetch('/api/produtos').then((r) => r.json()),
      ])

      setMaquinas(Array.isArray(m) ? m : [])
      setOrdens(Array.isArray(o) ? o : [])
      setProdutos(Array.isArray(p) ? p : [])

      if (o?.error) {
        setMensagem(o.error)
      }
    } catch {
      setMensagem('Erro ao carregar dados. Verifique a conexao.')
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
  }, [])

  useEffect(() => {
    localStorage.setItem(JANELA_STORAGE_KEY, JSON.stringify(janela))
  }, [janela])

  const ordensAtivas = useMemo(
    () => ordens.filter((o) => o.status !== 'concluida' && o.status !== 'cancelada'),
    [ordens]
  )

  const blocos: BlocoGantt[] = useMemo(
    () => ordensAtivas.filter((o) => o.inicio_agendado !== null).flatMap(ordemParaBlocos),
    [ordensAtivas]
  )

  const ordensSemHorario = useMemo(
    () => ordensAtivas.filter((o) => o.inicio_agendado === null),
    [ordensAtivas]
  )

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

  async function agendar(ordemId: string, maquinaId: string, inicio: Date) {
    setMensagem('')
    try {
      const res = await fetch('/api/ordens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ordemId,
          maquina_id: maquinaId,
          inicio_agendado: inicio.toISOString(),
        }),
      })

      if (res.status === 409) {
        setMensagem('Conflito de horario: escolha outro horario ou maquina.')
      } else if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMensagem(data.error ?? 'Erro ao agendar ordem.')
      }
    } catch {
      setMensagem('Erro de rede ao agendar ordem.')
    }

    await carregarDados()
  }

  async function desagendar(ordemId: string) {
    const res = await fetch('/api/ordens', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: ordemId,
        maquina_id: null,
        inicio_agendado: null,
        fim_calculado: null,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setMensagem(data.error ?? 'Erro ao remover agendamento.')
    }

    await carregarDados()
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
        setMensagem(data.error ?? 'Erro na sincronizacao com a API externa.')
      }
    } catch {
      setMensagem('Erro de rede ao sincronizar.')
    }

    setSincronizando(false)
  }

  async function executarAcaoOperacao(ordemId: string, acao: 'iniciar' | 'finalizar') {
    setExecutandoOrdemId(ordemId)
    setMensagem('')
    try {
      const res = await fetch('/api/ordens/operacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordem_id: ordemId, acao }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMensagem(data.error ?? 'Nao foi possivel registrar a operacao.')
      } else {
        setMensagem(acao === 'iniciar' ? 'Operacao iniciada com sucesso.' : 'Operacao finalizada com sucesso.')
      }
    } catch {
      setMensagem('Erro de rede ao registrar operacao.')
    } finally {
      setExecutandoOrdemId(null)
    }

    await carregarDados()
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="px-6 py-4 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-slate-900">Dashboard de Producao</h1>
            <p className="text-sm text-slate-500">Planejamento visual por maquina no estilo calendario operacional.</p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-1 py-1">
            <button
              onClick={() => setDia((d) => subDays(d, 1))}
              className="px-2 py-1 rounded-md text-sm text-slate-600 hover:bg-white"
            >
              {'<'}
            </button>
            <span className="text-sm font-medium text-slate-700 w-52 text-center">
              {format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </span>
            <button
              onClick={() => setDia((d) => addDays(d, 1))}
              className="px-2 py-1 rounded-md text-sm text-slate-600 hover:bg-white"
            >
              {'>'}
            </button>
          </div>

          <button
            onClick={() => setDia(new Date())}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
          >
            Hoje
          </button>

          <button
            onClick={sincronizar}
            disabled={sincronizando}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {sincronizando ? 'Sincronizando...' : 'Sincronizar API'}
          </button>

          <a href="/monitoramento" className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">
            Monitoramento
          </a>
          <a href="/admin" className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">
            Admin
          </a>
        </div>

        <div className="px-6 pb-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Turno</label>
            <select
              value={turnoSelecionado}
              onChange={(e) => aplicarPresetTurno(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700"
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
            <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Inicio</label>
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
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Fim</label>
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
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700"
            />
          </div>

          <span className="h-9 inline-flex items-center px-3 rounded-lg bg-slate-200 text-slate-700 text-xs font-medium">
            Janela ativa: {horaParaInput(janela.startHour)} - {horaParaInput(janela.endHour % 24 === 0 ? 0 : janela.endHour)}
          </span>
        </div>

        <div className="px-6 pb-4 flex flex-wrap gap-2">
          <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-medium">Total: {resumo.total}</span>
          <span className="px-2.5 py-1 rounded-full bg-cyan-100 text-cyan-700 text-xs font-medium">Tanque: {resumo.tanque}</span>
          <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium">Envase: {resumo.envase}</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">Agendadas: {resumo.agendadas}</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-300 text-slate-700 text-xs font-medium">Concluidas: {resumo.concluidas}</span>
        </div>
      </header>

      {mensagem && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-800">{mensagem}</div>
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

      <OperacaoDashboard
        maquinas={maquinas}
        ordens={ordens.filter((o) => o.inicio_agendado !== null)}
        executandoOrdemId={executandoOrdemId}
        onAcao={executarAcaoOperacao}
      />

      <main className="flex flex-1 gap-4 p-4 overflow-hidden">
        <OrdemSidebar ordens={ordensSemHorario} onNovaOrdem={() => setNovaOrdemAberta(true)} />

        <div className="flex-1 overflow-x-auto">
          <GanttChart
            maquinas={maquinas}
            blocos={blocos}
            ordens={ordensAtivas.filter((o) => o.inicio_agendado !== null)}
            dia={dia}
            janela={janela}
            onAgendar={agendar}
            onDesagendar={desagendar}
          />
        </div>
      </main>
    </div>
  )
}
