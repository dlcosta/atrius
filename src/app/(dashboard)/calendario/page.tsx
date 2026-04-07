'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Maquina, Ordem, Produto, BlocoGantt } from '@/types'
import { GanttChart } from '@/components/planner/GanttChart'
import { OrdemSidebar } from '@/components/planner/OrdemSidebar'
import { NovaOrdemForm } from '@/components/planner/NovaOrdemForm'
import { ordemParaBlocos } from '@/lib/planning/engine'
import {
  DEFAULT_JANELA_PRODUCAO,
  JanelaProducao,
  sanitizarJanelaProducao,
} from '@/lib/planning/gantt-layout'

const JANELA_STORAGE_KEY = 'atrius:planner:janela-producao'

function horaParaInput(hora: number): string {
  return `${String(hora).padStart(2, '0')}:00`
}

function inputParaHora(valor: string, fallback: number): number {
  const hora = Number(valor.split(':')[0])
  if (Number.isNaN(hora)) return fallback
  return hora
}

export default function CalendarioPage() {
  const [dia, setDia] = useState<Date>(() => new Date())
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [mensagem, setMensagem] = useState('')
  const [novaOrdemAberta, setNovaOrdemAberta] = useState(false)
  const [janela, setJanela] = useState<JanelaProducao>(DEFAULT_JANELA_PRODUCAO)

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

      if (o?.error) setMensagem(o.error)
    } catch {
      setMensagem('Erro ao carregar dados.')
    }
  }, [dia])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(JANELA_STORAGE_KEY)
      if (salvo) setJanela(sanitizarJanelaProducao(JSON.parse(salvo)))
    } catch {}
  }, [])

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

  async function agendar(ordemId: string, maquinaId: string, inicio: Date) {
    try {
      await fetch('/api/ordens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ordemId, maquina_id: maquinaId, inicio_agendado: inicio.toISOString() }),
      })
      await carregarDados()
    } catch {}
  }

  async function desagendar(ordemId: string) {
    try {
      await fetch('/api/ordens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ordemId, maquina_id: null, inicio_agendado: null }),
      })
      await carregarDados()
    } catch {}
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      <div className="border-b border-slate-200 bg-white p-4 flex items-center justify-between shadow-sm relative z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1 py-1">
            <button onClick={() => setDia((d) => subDays(d, 1))} className="px-2 py-1 rounded-md text-sm text-slate-600 hover:bg-white transition-colors">{'<'}</button>
            <span className="text-sm font-black text-slate-700 w-48 text-center uppercase tracking-tighter">
              {format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </span>
            <button onClick={() => setDia((d) => addDays(d, 1))} className="px-2 py-1 rounded-md text-sm text-slate-600 hover:bg-white transition-colors">{'>'}</button>
          </div>
          <button onClick={() => setDia(new Date())} className="px-3 py-2 rounded-md border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">Hoje</button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-md border border-slate-200">
             <span className="text-[10px] font-black text-slate-500 uppercase ml-2">Visualização:</span>
             <div className="flex items-center gap-1 px-3 py-1.5 bg-white rounded shadow-xs text-xs font-black text-blue-600 border border-blue-100">
               JANELA {horaParaInput(janela.startHour)} - {horaParaInput(janela.endHour)}
             </div>
          </div>
        </div>
      </div>

      <main className="flex flex-1 gap-4 p-4 overflow-hidden">
        <OrdemSidebar ordens={ordensSemHorario} onNovaOrdem={() => setNovaOrdemAberta(true)} />
        
        <div className="flex-1 overflow-x-auto rounded-lg border-2 border-slate-200 shadow-inner bg-slate-200/20">
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

      {novaOrdemAberta && (
        <NovaOrdemForm
          produtos={produtos}
          dataInicial={dia}
          onSalvo={() => { setNovaOrdemAberta(false); carregarDados(); }}
          onFechar={() => setNovaOrdemAberta(false)}
        />
      )}
    </div>
  )
}