 'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Maquina, Ordem, Produto } from '@/types'
import { NovaOrdemForm } from '@/components/planner/NovaOrdemForm'
import { OperacaoDashboard } from '@/components/planner/OperacaoDashboard'
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
  const [isExpanded, setIsExpanded] = useState(false)
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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-slate-200 bg-white p-4 space-y-4 shadow-sm relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <img src="/logoAtrius.webp" alt="Atrius Logo" className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Painel de Controle Atrius</h1>
            <p className="text-xs font-bold text-slate-500">Monitoramento e Gestão de Produção em Tempo Real</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1 py-1">
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

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-black uppercase tracking-widest hover:bg-black transition-all shadow-md active:scale-95"
            >
              Expandir Painel Operacional
            </button>
            <button
              onClick={sincronizar}
              disabled={sincronizando}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {sincronizando ? 'Sincronizando...' : 'Sincronizar API'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
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

        <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-100">
          <div className="px-5 py-2 rounded-xl bg-slate-100 border border-slate-200 shadow-sm">
            <span className="text-[10px] font-black text-slate-500 uppercase block leading-none mb-1">Total</span>
            <span className="text-2xl font-black text-slate-900 leading-none">{resumo.total}</span>
          </div>
          <div className="px-5 py-2 rounded-xl bg-blue-50 border border-blue-200 shadow-sm">
            <span className="text-[10px] font-black text-blue-500 uppercase block leading-none mb-1">Tanque</span>
            <span className="text-2xl font-black text-blue-700 leading-none">{resumo.tanque}</span>
          </div>
          <div className="px-5 py-2 rounded-xl bg-purple-50 border border-purple-200 shadow-sm">
            <span className="text-[10px] font-black text-purple-500 uppercase block leading-none mb-1">Envase</span>
            <span className="text-2xl font-black text-purple-700 leading-none">{resumo.envase}</span>
          </div>
          <div className="px-5 py-2 rounded-xl bg-green-50 border border-green-200 shadow-sm">
            <span className="text-[10px] font-black text-green-500 uppercase block leading-none mb-1">Agendadas</span>
            <span className="text-2xl font-black text-green-700 leading-none">{resumo.agendadas}</span>
          </div>
          <div className="px-5 py-2 rounded-xl bg-slate-100 border border-slate-300 shadow-sm">
            <span className="text-[10px] font-black text-slate-500 uppercase block leading-none mb-1">Concluídas</span>
            <span className="text-2xl font-black text-slate-700 leading-none">{resumo.concluidas}</span>
          </div>
        </div>
      </div>

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

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {isExpanded ? (
          <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto p-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="max-w-[1600px] mx-auto space-y-6">
              <div className="flex items-center justify-between bg-white p-6 rounded-xl border-2 border-slate-200 shadow-xl mb-6">
                <div className="flex items-center gap-4">
                  <img src="/logoAtrius.webp" alt="Atrius Logo" className="h-16 w-auto" />
                  <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">Painel de Produção</h1>
                    <p className="text-lg font-bold text-slate-500 uppercase tracking-widest mt-1">Controle de Chão de Fábrica</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 p-2 shadow-inner">
                    <button
                      onClick={() => setDia((d) => subDays(d, 1))}
                      className="px-6 py-3 rounded-xl text-xl font-black text-slate-600 hover:bg-white hover:text-blue-600 transition-all shadow-sm active:scale-95"
                    >
                      Ontem
                    </button>
                    <div className="h-10 w-[2px] bg-slate-200 mx-2" />
                    <button
                      onClick={() => setDia(new Date())}
                      className="px-8 py-3 rounded-xl text-xl font-black text-blue-700 bg-white shadow-md border-2 border-blue-100 hover:bg-blue-50 transition-all active:scale-95"
                    >
                      HOJE
                    </button>
                    <div className="h-10 w-[2px] bg-slate-200 mx-2" />
                    <button
                      onClick={() => setDia((d) => addDays(d, 1))}
                      className="px-6 py-3 rounded-xl text-xl font-black text-slate-600 hover:bg-white hover:text-blue-600 transition-all shadow-sm active:scale-95"
                    >
                      Amanhã
                    </button>
                  </div>

                  <div className="bg-slate-900 text-white px-6 py-3 rounded-xl border-b-4 border-slate-950 flex flex-col items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data Visualizada</span>
                    <span className="text-2xl font-black uppercase tracking-tighter">
                      {format(dia, "dd 'de' MMMM", { locale: ptBR })}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsExpanded(false)}
                  className="px-8 py-4 bg-red-600 text-white rounded-xl text-xl font-black uppercase tracking-tighter hover:bg-red-700 shadow-2xl transition-all active:scale-95 border-b-4 border-red-800 ml-4"
                >
                  Sair
                </button>
              </div>
              
              <OperacaoDashboard
                maquinas={maquinas}
                ordens={ordens.filter((o) => o.inicio_agendado !== null)}
                executandoOrdemId={executandoOrdemId}
                onAcao={executarAcaoOperacao}
              />
            </div>
          </div>
        ) : (
          <OperacaoDashboard
            maquinas={maquinas}
            ordens={ordens.filter((o) => o.inicio_agendado !== null)}
            executandoOrdemId={executandoOrdemId}
            onAcao={executarAcaoOperacao}
          />
        )}
      </main>
    </div>
  )
}
