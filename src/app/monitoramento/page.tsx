'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Maquina, Ordem } from '@/types'
import {
  calcularIndicadores,
  formatarMinutos,
  obterQuantidadeProduzidaEstimada,
  obterTempoProducaoMin,
} from '@/lib/monitoring/indicadores'

const REFRESH_MS = 15000

function formatarNumero(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(valor)
}

function formatarDataHora(dataIso: string | null | undefined): string {
  if (!dataIso) return '--'
  return format(new Date(dataIso), 'dd/MM HH:mm', { locale: ptBR })
}

function mesmoDia(dataIso: string | null | undefined, dia: Date): boolean {
  if (!dataIso) return false
  return format(new Date(dataIso), 'yyyy-MM-dd') === format(dia, 'yyyy-MM-dd')
}

function pertenceAoDia(ordem: Ordem, dia: Date): boolean {
  return (
    ordem.data_prevista === format(dia, 'yyyy-MM-dd') ||
    mesmoDia(ordem.inicio_agendado, dia) ||
    mesmoDia(ordem.inicio_operacao_em, dia) ||
    mesmoDia(ordem.fim_operacao_em, dia)
  )
}

export default function MonitoramentoPage() {
  const [dia, setDia] = useState<Date>(() => new Date())
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [erro, setErro] = useState('')

  const carregarDados = useCallback(async () => {
    try {
      setErro('')
      const dataStr = format(dia, 'yyyy-MM-dd')
      const [m, o] = await Promise.all([
        fetch('/api/maquinas').then((r) => r.json()),
        fetch(`/api/ordens?data=${dataStr}`).then((r) => r.json()),
      ])

      setMaquinas(Array.isArray(m) ? m : [])
      setOrdens(Array.isArray(o) ? o : [])
      if (o?.error) setErro(o.error)
    } catch {
      setErro('Erro ao carregar monitoramento.')
    }
  }, [dia])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  useEffect(() => {
    const timer = setInterval(carregarDados, REFRESH_MS)
    return () => clearInterval(timer)
  }, [carregarDados])

  const ordensDia = useMemo(
    () => ordens.filter((o) => o.status !== 'cancelada').filter((o) => pertenceAoDia(o, dia)),
    [ordens, dia]
  )

  const maquinasAtivas = useMemo(() => maquinas.filter((m) => m.ativa), [maquinas])
  const indicadores = useMemo(
    () => calcularIndicadores(ordensDia, maquinasAtivas.length),
    [ordensDia, maquinasAtivas.length]
  )

  const ordensOrdenadas = useMemo(() => {
    return [...ordensDia].sort((a, b) => {
      const aMs = a.inicio_operacao_em
        ? new Date(a.inicio_operacao_em).getTime()
        : a.inicio_agendado
          ? new Date(a.inicio_agendado).getTime()
          : Number.MAX_SAFE_INTEGER
      const bMs = b.inicio_operacao_em
        ? new Date(b.inicio_operacao_em).getTime()
        : b.inicio_agendado
          ? new Date(b.inicio_agendado).getTime()
          : Number.MAX_SAFE_INTEGER
      return aMs - bMs
    })
  }, [ordensDia])

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-slate-900">Painel de monitoramento da producao</h1>
            <p className="text-sm text-slate-500">Acompanhamento em tempo real de quantidade produzida e tempo operacional.</p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-1 py-1">
            <button onClick={() => setDia((d) => subDays(d, 1))} className="px-2 py-1 rounded-md text-sm text-slate-600 hover:bg-white">
              {'<'}
            </button>
            <span className="text-sm font-medium text-slate-700 w-52 text-center">
              {format(dia, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </span>
            <button onClick={() => setDia((d) => addDays(d, 1))} className="px-2 py-1 rounded-md text-sm text-slate-600 hover:bg-white">
              {'>'}
            </button>
          </div>

          <button onClick={() => setDia(new Date())} className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">
            Hoje
          </button>
          <a href="/planner" className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50">
            Planner
          </a>
        </div>
      </header>

      {erro && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-800">{erro}</div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">Ordens do dia</div>
            <div className="text-2xl font-semibold text-slate-900">{indicadores.totalOrdens}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">Em producao</div>
            <div className="text-2xl font-semibold text-emerald-600">{indicadores.ordensEmProducao}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">Concluidas</div>
            <div className="text-2xl font-semibold text-slate-900">{indicadores.ordensConcluidas}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">Qtd produzida (est.)</div>
            <div className="text-2xl font-semibold text-slate-900">{formatarNumero(indicadores.quantidadeProduzidaEstimada)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">% produzido</div>
            <div className="text-2xl font-semibold text-slate-900">{formatarNumero(indicadores.percentualProduzido)}%</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">Tempo acumulado</div>
            <div className="text-2xl font-semibold text-slate-900">{formatarMinutos(indicadores.tempoProducaoAcumuladoMin)}</div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {maquinasAtivas.map((maquina) => {
            const ordensMaquina = ordensDia.filter((o) => o.maquina_id === maquina.id)
            const emProducao = ordensMaquina.find((o) => o.status === 'produzindo')
            const qtdPlanejada = ordensMaquina.reduce((acc, o) => acc + Number(o.quantidade || 0), 0)
            const qtdProduzida = ordensMaquina.reduce((acc, o) => acc + obterQuantidadeProduzidaEstimada(o), 0)
            const tempoTotalMin = ordensMaquina.reduce((acc, o) => acc + obterTempoProducaoMin(o), 0)
            const progresso = qtdPlanejada > 0 ? (qtdProduzida / qtdPlanejada) * 100 : 0

            return (
              <div key={maquina.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">{maquina.nome}</h2>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      emProducao ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {emProducao ? 'Produzindo' : 'Sem producao ativa'}
                  </span>
                </div>

                <div className="mt-2 text-xs text-slate-500 grid grid-cols-2 gap-y-1">
                  <span>Qtd planejada: {formatarNumero(qtdPlanejada)}</span>
                  <span>Qtd produzida: {formatarNumero(qtdProduzida)}</span>
                  <span>Tempo producao: {formatarMinutos(tempoTotalMin)}</span>
                  <span>Atrasos: {ordensMaquina.filter((o) => o.status === 'atrasada').length}</span>
                </div>

                <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, progresso))}%` }} />
                </div>

                {emProducao && (
                  <div className="mt-2 text-[11px] text-slate-600">
                    Ordem #{emProducao.numero_externo} em producao · previsao termino {formatarDataHora(emProducao.fim_calculado)}
                  </div>
                )}
              </div>
            )
          })}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Ordens e indicadores por programacao</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Maquina</th>
                  <th className="px-3 py-2 text-left">Ordem</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Inicio real</th>
                  <th className="px-3 py-2 text-left">Previsao termino</th>
                  <th className="px-3 py-2 text-left">Fim real</th>
                  <th className="px-3 py-2 text-right">Qtd produzida (est.)</th>
                  <th className="px-3 py-2 text-right">Tempo producao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ordensOrdenadas.map((ordem) => (
                  <tr key={ordem.id}>
                    <td className="px-3 py-2 text-slate-700">{ordem.maquina?.nome ?? '--'}</td>
                    <td className="px-3 py-2 text-slate-700">#{ordem.numero_externo}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs">{ordem.status}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{formatarDataHora(ordem.inicio_operacao_em)}</td>
                    <td className="px-3 py-2 text-slate-600">{formatarDataHora(ordem.fim_calculado)}</td>
                    <td className="px-3 py-2 text-slate-600">{formatarDataHora(ordem.fim_operacao_em)}</td>
                    <td className="px-3 py-2 text-right text-slate-800">{formatarNumero(obterQuantidadeProduzidaEstimada(ordem))}</td>
                    <td className="px-3 py-2 text-right text-slate-800">{formatarMinutos(obterTempoProducaoMin(ordem))}</td>
                  </tr>
                ))}
                {ordensOrdenadas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                      Nenhuma ordem encontrada para o dia selecionado.
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
