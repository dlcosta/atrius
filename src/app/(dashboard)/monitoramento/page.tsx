'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, format, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Maquina, Ordem } from '@/types'
import {
  calcularIndicadores,
  calcularMediaTempoPorProduto,
  calcularTempoRestanteMs,
  formatarDuracaoRelogio,
  formatarMinutos,
  obterQuantidadeProduzidaEstimada,
  obterTempoProducaoMin,
} from '@/lib/monitoring/indicadores'

const REFRESH_MS = 15000
const DIAS_MEDIA_OPTIONS = [3, 7, 15, 30]

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
  const [agoraMs, setAgoraMs] = useState<number>(Date.now())
  const [diasMedia, setDiasMedia] = useState<number>(7)
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [ordensDiaRaw, setOrdensDiaRaw] = useState<Ordem[]>([])
  const [ordensHistorico, setOrdensHistorico] = useState<Ordem[]>([])
  const [erro, setErro] = useState('')

  const carregarDados = useCallback(async () => {
    try {
      setErro('')
      const dataStr = format(dia, 'yyyy-MM-dd')
      const [m, oDia, oHist] = await Promise.all([
        fetch('/api/maquinas').then((r) => r.json()),
        fetch(`/api/ordens?data=${dataStr}`).then((r) => r.json()),
        fetch(`/api/ordens?data=${dataStr}&dias=${diasMedia}`).then((r) => r.json()),
      ])

      setMaquinas(Array.isArray(m) ? m : [])
      setOrdensDiaRaw(Array.isArray(oDia) ? oDia : [])
      setOrdensHistorico(Array.isArray(oHist) ? oHist : [])

      if (oDia?.error) setErro(oDia.error)
      if (oHist?.error) setErro(oHist.error)
    } catch {
      setErro('Erro ao carregar monitoramento.')
    }
  }, [dia, diasMedia])

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

  const ordensDia = useMemo(
    () => ordensDiaRaw.filter((o) => o.status !== 'cancelada').filter((o) => pertenceAoDia(o, dia)),
    [ordensDiaRaw, dia]
  )

  const maquinasAtivas = useMemo(() => maquinas.filter((m) => m.ativa), [maquinas])

  const indicadores = useMemo(
    () => calcularIndicadores(ordensDia, maquinasAtivas.length, agoraMs),
    [ordensDia, maquinasAtivas.length, agoraMs]
  )

  const mediasProduto = useMemo(() => {
    return calcularMediaTempoPorProduto(ordensHistorico)
  }, [ordensHistorico])

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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-slate-200 bg-white p-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-1 py-1">
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

          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Media produto:</label>
            <select
              value={diasMedia}
              onChange={(e) => setDiasMedia(Number(e.target.value))}
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700"
            >
              {DIAS_MEDIA_OPTIONS.map((dias) => (
                <option key={dias} value={dias}>
                  ultimos {dias} dias
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {erro && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-800">{erro}</div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ordens do dia</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{indicadores.totalOrdens}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Em producao</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{indicadores.ordensEmProducao}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Concluidas</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{indicadores.ordensConcluidas}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Qtd (est.)</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{formatarNumero(indicadores.quantidadeProduzidaEstimada)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">% produzido</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{formatarNumero(indicadores.percentualProduzido)}%</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tempo acumulado</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{formatarMinutos(indicadores.tempoProducaoAcumuladoMin)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ciclo medio</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{formatarMinutos(indicadores.tempoMedioCicloMin)}</div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {maquinasAtivas.map((maquina) => {
            const ordensMaquina = ordensDia.filter((o) => o.maquina_id === maquina.id)
            const emProducao = ordensMaquina.find((o) => o.status === 'produzindo')
            const qtdPlanejada = ordensMaquina.reduce((acc, o) => acc + Number(o.quantidade || 0), 0)
            const qtdProduzida = ordensMaquina.reduce((acc, o) => acc + obterQuantidadeProduzidaEstimada(o, agoraMs), 0)
            const tempoTotalMin = ordensMaquina.reduce((acc, o) => acc + obterTempoProducaoMin(o, agoraMs), 0)
            const progresso = qtdPlanejada > 0 ? (qtdProduzida / qtdPlanejada) * 100 : 0

            const restanteMs = emProducao ? calcularTempoRestanteMs(emProducao, agoraMs) : null
            const decorridoMin = emProducao ? obterTempoProducaoMin(emProducao, agoraMs) : 0

            return (
              <div key={maquina.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
                  <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-[11px] font-semibold text-emerald-700">
                      Ordem #{emProducao.numero_externo} em producao
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                      <div>
                        <div className="text-slate-500">Tempo decorrido</div>
                        <div className="font-semibold">{formatarMinutos(decorridoMin)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Tempo restante</div>
                        <div className="font-semibold">{restanteMs === null ? '--' : formatarDuracaoRelogio(restanteMs)}</div>
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-600">
                      Previsao de termino: <span className="font-semibold">{formatarDataHora(emProducao.fim_calculado)}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Media de tempo de producao por produto</h2>
            <span className="text-xs text-slate-500">ultimos {diasMedia} dias</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Produto</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-right">Ordens concluidas</th>
                  <th className="px-3 py-2 text-right">Tempo medio</th>
                  <th className="px-3 py-2 text-right">Melhor tempo</th>
                  <th className="px-3 py-2 text-right">Pior tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mediasProduto.map((media) => (
                  <tr key={media.produtoSku}>
                    <td className="px-3 py-2 text-slate-800 font-medium">{media.produtoNome}</td>
                    <td className="px-3 py-2 text-slate-600">{media.produtoSku}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{media.ordensConcluidas}</td>
                    <td className="px-3 py-2 text-right text-slate-900 font-semibold">{formatarMinutos(media.tempoMedioMin)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{formatarMinutos(media.tempoMinMin)}</td>
                    <td className="px-3 py-2 text-right text-red-700">{formatarMinutos(media.tempoMaxMin)}</td>
                  </tr>
                ))}
                {mediasProduto.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                      Sem dados de producao concluida para os ultimos {diasMedia} dias.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/50">
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
                    <td className="px-3 py-2 text-right text-slate-800">{formatarNumero(obterQuantidadeProduzidaEstimada(ordem, agoraMs))}</td>
                    <td className="px-3 py-2 text-right text-slate-800">{formatarMinutos(obterTempoProducaoMin(ordem, agoraMs))}</td>
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
