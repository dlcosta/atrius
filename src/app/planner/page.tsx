'use client'
import { useEffect, useState, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Maquina, Ordem, BlocoGantt } from '@/types'
import { GanttChart } from '@/components/planner/GanttChart'
import { OrdemSidebar } from '@/components/planner/OrdemSidebar'
import { ordemParaBlocos } from '@/lib/planning/engine'

export default function PlannerPage() {
  const [dia, setDia] = useState<Date>(() => new Date())
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const carregarDados = useCallback(async () => {
    const dataStr = format(dia, 'yyyy-MM-dd')
    const [m, o] = await Promise.all([
      fetch('/api/maquinas').then((r) => r.json()),
      fetch(`/api/ordens?data=${dataStr}`).then((r) => r.json()),
    ])
    setMaquinas(Array.isArray(m) ? m : [])
    setOrdens(Array.isArray(o) ? o : [])
  }, [dia])

  useEffect(() => { carregarDados() }, [carregarDados])

  const blocos: BlocoGantt[] = ordens
    .filter((o) => o.inicio_agendado !== null)
    .flatMap(ordemParaBlocos)

  const ordensSemHorario = ordens.filter((o) => o.inicio_agendado === null)

  async function agendar(ordemId: string, maquinaId: string, inicio: Date) {
    setMensagem('')
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
      setMensagem('Conflito de horário — escolha outro horário ou máquina.')
    } else if (!res.ok) {
      setMensagem('Erro ao agendar ordem.')
    }
    await carregarDados()
  }

  async function desagendar(ordemId: string) {
    await fetch('/api/ordens', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: ordemId,
        maquina_id: null,
        inicio_agendado: null,
      }),
    })
    await carregarDados()
  }

  async function sincronizar() {
    setSincronizando(true)
    setMensagem('')
    const res = await fetch('/api/sincronizar', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setMensagem(`Sincronizado: ${data.importadas} ordens importadas, ${data.erros} erros.`)
      await carregarDados()
    } else {
      setMensagem('Erro na sincronização com a API externa.')
    }
    setSincronizando(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold text-gray-900 mr-auto">Atrius Planner</h1>

        {/* Date navigation */}
        <button
          onClick={() => setDia((d) => subDays(d, 1))}
          className="px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-gray-700 w-44 text-center">
          {format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </span>
        <button
          onClick={() => setDia((d) => addDays(d, 1))}
          className="px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
        >
          ›
        </button>
        <button
          onClick={() => setDia(new Date())}
          className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
        >
          Hoje
        </button>

        <button
          onClick={sincronizar}
          disabled={sincronizando}
          className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {sincronizando ? 'Sincronizando...' : '↻ Sincronizar API'}
        </button>

        <a href="/admin" className="text-sm text-gray-500 hover:text-gray-700">Admin</a>
      </header>

      {mensagem && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-800">
          {mensagem}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 gap-4 p-4 overflow-hidden">
        <OrdemSidebar ordens={ordensSemHorario} />
        <div className="flex-1 overflow-x-auto">
          <GanttChart
            maquinas={maquinas}
            blocos={blocos}
            ordens={ordens.filter((o) => o.inicio_agendado !== null)}
            dia={dia}
            onAgendar={agendar}
            onDesagendar={desagendar}
          />
        </div>
      </div>
    </div>
  )
}
