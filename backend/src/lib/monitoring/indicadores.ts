import type { Ordem } from '../../types'

export type IndicadoresProducao = {
  totalOrdens: number
  ordensEmProducao: number
  ordensConcluidas: number
  ordensAtrasadas: number
  quantidadePlanejada: number
  quantidadeProduzidaEstimada: number
  percentualProduzido: number
  tempoProducaoAcumuladoMin: number
  tempoMedioCicloMin: number
  maquinasProduzindo: number
}

export type MediaTempoProduto = {
  produtoSku: string
  produtoNome: string
  ordensConcluidas: number
  tempoMedioMin: number
  tempoMinMin: number
  tempoMaxMin: number
}

export type EventoMonitoramento = {
  id?: string
  ordem_id: string | null
  maquina_id: string | null
  tipo: 'inicio' | 'pausa' | 'retomada' | 'conclusao'
  timestamp: string
  operador_nome?: string | null
}

export type MachinePerformance = {
  machineId: string
  machineName: string
  totalOrders: number
  activeOrders: number
  pausedOrders: number
  completedOrders: number
  outputLiters: number
  plannedMinutes: number
  actualMinutes: number
  pauseMinutes: number
  idleMinutes: number
  averageCycleMinutes: number
  averageDelayMinutes: number
  onTimeRate: number
  utilizationRate: number
}

export type OperatorPerformance = {
  operatorName: string
  completedOrders: number
  activeOrders: number
  outputLiters: number
  actualMinutes: number
  plannedMinutes: number
  averageCycleMinutes: number
  averageDelayMinutes: number
  onTimeRate: number
  efficiencyRate: number
  pauseEvents: number
  pauseMinutes: number
}

function toMs(dataIso: string | null | undefined): number | null {
  if (!dataIso) return null
  const t = new Date(dataIso).getTime()
  return Number.isFinite(t) ? t : null
}

function clampMinutes(startMs: number, endMs: number, rangeStartMs: number, rangeEndMs: number) {
  const inicio = Math.max(startMs, rangeStartMs)
  const fim = Math.min(endMs, rangeEndMs)
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return 0
  return (fim - inicio) / 60000
}

function getOrderPlannedMinutes(ordem: Ordem): number {
  const total = Number(ordem.total_duration_minutes ?? 0)
  if (Number.isFinite(total) && total > 0) return total

  return (
    Number(ordem.setup_time_minutes ?? 0) +
    Number(ordem.production_time_minutes ?? 0) +
    Number(ordem.cleaning_time_minutes ?? 0)
  )
}

function getOrderOutputLiters(ordem: Ordem): number {
  const referencia = Number(ordem.quantidade_referencia_litros ?? NaN)
  if (Number.isFinite(referencia) && referencia > 0) return referencia
  const quantidade = Number(ordem.quantidade ?? 0)
  return Number.isFinite(quantidade) ? quantidade : 0
}

function isCompletedOrder(ordem: Ordem): boolean {
  return ordem.status === 'concluida' || Boolean(ordem.fim_operacao_em) || ordem.planning_status === 'COMPLETED'
}

function isActiveOrder(ordem: Ordem): boolean {
  return ordem.status === 'produzindo' || ordem.status === 'pausada'
}

function finishedOnTime(ordem: Ordem): boolean {
  const fimRealMs = toMs(ordem.fim_operacao_em)
  const fimPrevistoMs = toMs(ordem.fim_calculado)

  if (fimRealMs && fimPrevistoMs) {
    return fimRealMs <= fimPrevistoMs + 5 * 60 * 1000
  }

  const planejado = getOrderPlannedMinutes(ordem)
  const real = obterTempoProducaoMin(ordem)
  if (planejado <= 0 || real <= 0) return false
  return real <= planejado + 5
}

export function obterQuantidadeProduzidaEstimada(ordem: Ordem, agoraMs = Date.now()): number {
  if (ordem.status === 'concluida' || ordem.fim_operacao_em) {
    return Number(ordem.quantidade)
  }

  const inicioMs = toMs(ordem.inicio_operacao_em)
  const fimPrevistoMs = toMs(ordem.fim_calculado)
  if (!inicioMs || !fimPrevistoMs || fimPrevistoMs <= inicioMs) return 0

  const totalMs = fimPrevistoMs - inicioMs
  const elapsedMs = Math.min(Math.max(agoraMs - inicioMs, 0), totalMs)
  const fracao = elapsedMs / totalMs
  return Number(ordem.quantidade) * fracao
}

export function obterTempoProducaoMin(ordem: Ordem, agoraMs = Date.now()): number {
  const inicioMs = toMs(ordem.inicio_operacao_em)
  if (!inicioMs) return 0

  const fimMs = toMs(ordem.fim_operacao_em) ?? agoraMs
  if (fimMs <= inicioMs) return 0

  return (fimMs - inicioMs) / 60000
}

export function calcularIndicadores(ordens: Ordem[], maquinasAtivas: number, agoraMs = Date.now()): IndicadoresProducao {
  const totalOrdens = ordens.length
  const ordensEmProducao = ordens.filter((o) => o.status === 'produzindo').length
  const ordensConcluidas = ordens.filter((o) => o.status === 'concluida').length

  const ordensAtrasadas = ordens.filter((o) => {
    if (o.status === 'concluida' || o.status === 'cancelada') return false
    const fimPrevisto = toMs(o.fim_calculado)
    return Boolean(fimPrevisto && fimPrevisto < agoraMs)
  }).length

  const quantidadePlanejada = ordens.reduce((acc, ordem) => acc + Number(ordem.quantidade || 0), 0)
  const quantidadeProduzidaEstimada = ordens.reduce(
    (acc, ordem) => acc + obterQuantidadeProduzidaEstimada(ordem, agoraMs),
    0
  )

  const percentualProduzido =
    quantidadePlanejada > 0 ? (quantidadeProduzidaEstimada / quantidadePlanejada) * 100 : 0

  const tempoProducaoAcumuladoMin = ordens.reduce(
    (acc, ordem) => acc + obterTempoProducaoMin(ordem, agoraMs),
    0
  )

  const concluidasComTempo = ordens.filter((o) => Boolean(o.inicio_operacao_em && o.fim_operacao_em))
  const tempoMedioCicloMin =
    concluidasComTempo.length > 0
      ? concluidasComTempo.reduce((acc, ordem) => acc + obterTempoProducaoMin(ordem, agoraMs), 0) /
        concluidasComTempo.length
      : 0

  const maquinasProduzindo =
    maquinasAtivas > 0
      ? new Set(ordens.filter((o) => o.status === 'produzindo').map((o) => o.maquina_id).filter(Boolean)).size
      : 0

  return {
    totalOrdens,
    ordensEmProducao,
    ordensConcluidas,
    ordensAtrasadas,
    quantidadePlanejada,
    quantidadeProduzidaEstimada,
    percentualProduzido,
    tempoProducaoAcumuladoMin,
    tempoMedioCicloMin,
    maquinasProduzindo,
  }
}

export function formatarMinutos(min: number): string {
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export function formatarDuracaoRelogio(ms: number): string {
  const totalSeg = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeg / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  const s = totalSeg % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export function calcularTempoRestanteMs(ordem: Ordem, agoraMs = Date.now()): number | null {
  if (!ordem.fim_calculado) return null
  const fimMs = toMs(ordem.fim_calculado)
  if (!fimMs) return null
  return Math.max(0, fimMs - agoraMs)
}

export function calcularMediaTempoPorProduto(ordens: Ordem[]): MediaTempoProduto[] {
  const concluidas = ordens.filter((ordem) => {
    return (
      Boolean(ordem.inicio_operacao_em && ordem.fim_operacao_em) &&
      (ordem.status === 'concluida' || Boolean(ordem.fim_operacao_em))
    )
  })

  const porProduto = new Map<string, { nome: string; tempos: number[] }>()

  for (const ordem of concluidas) {
    const tempoMin = obterTempoProducaoMin(ordem)
    if (tempoMin <= 0) continue

    const sku = ordem.produto_sku ?? 'SEM-SKU'
    const nome = ordem.produto?.nome ?? sku
    const item = porProduto.get(sku) ?? { nome, tempos: [] }
    item.tempos.push(tempoMin)
    if (!item.nome && nome) item.nome = nome
    porProduto.set(sku, item)
  }

  const resultado: MediaTempoProduto[] = []
  porProduto.forEach((valor, sku) => {
    if (valor.tempos.length === 0) return
    const soma = valor.tempos.reduce((acc, t) => acc + t, 0)
    resultado.push({
      produtoSku: sku,
      produtoNome: valor.nome || sku,
      ordensConcluidas: valor.tempos.length,
      tempoMedioMin: soma / valor.tempos.length,
      tempoMinMin: Math.min(...valor.tempos),
      tempoMaxMin: Math.max(...valor.tempos),
    })
  })

  return resultado.sort((a, b) => b.ordensConcluidas - a.ordensConcluidas || a.tempoMedioMin - b.tempoMedioMin)
}

export function calcularPausasNoPeriodo(
  eventos: EventoMonitoramento[],
  rangeStartMs: number,
  rangeEndMs: number,
  agoraMs = Date.now()
) {
  const byMachine = new Map<string, number>()
  const byOperator = new Map<string, { pauseEvents: number; pauseMinutes: number }>()
  const grouped = new Map<string, EventoMonitoramento[]>()

  for (const evento of eventos) {
    if (!evento.maquina_id) continue
    const key = evento.maquina_id
    const lista = grouped.get(key) ?? []
    lista.push(evento)
    grouped.set(key, lista)
  }

  for (const [machineId, lista] of grouped.entries()) {
    const ordenados = [...lista].sort((a, b) => {
      const aMs = toMs(a.timestamp) ?? 0
      const bMs = toMs(b.timestamp) ?? 0
      return aMs - bMs
    })

    let pausaAtiva: { startMs: number; operatorName: string | null } | null = null

    for (const evento of ordenados) {
      const eventoMs = toMs(evento.timestamp)
      if (!eventoMs) continue

      if (evento.tipo === 'pausa') {
        if (!pausaAtiva) {
          pausaAtiva = {
            startMs: eventoMs,
            operatorName: evento.operador_nome?.trim() || null,
          }
          if (pausaAtiva.operatorName) {
            const atual = byOperator.get(pausaAtiva.operatorName) ?? { pauseEvents: 0, pauseMinutes: 0 }
            atual.pauseEvents += 1
            byOperator.set(pausaAtiva.operatorName, atual)
          }
        }
        continue
      }

      if ((evento.tipo === 'retomada' || evento.tipo === 'conclusao') && pausaAtiva) {
        const minutes = clampMinutes(pausaAtiva.startMs, eventoMs, rangeStartMs, rangeEndMs)
        if (minutes > 0) {
          byMachine.set(machineId, (byMachine.get(machineId) ?? 0) + minutes)
          if (pausaAtiva.operatorName) {
            const atual = byOperator.get(pausaAtiva.operatorName) ?? { pauseEvents: 0, pauseMinutes: 0 }
            atual.pauseMinutes += minutes
            byOperator.set(pausaAtiva.operatorName, atual)
          }
        }
        pausaAtiva = null
      }
    }

    if (pausaAtiva) {
      const minutes = clampMinutes(pausaAtiva.startMs, Math.min(rangeEndMs, agoraMs), rangeStartMs, rangeEndMs)
      if (minutes > 0) {
        byMachine.set(machineId, (byMachine.get(machineId) ?? 0) + minutes)
        if (pausaAtiva.operatorName) {
          const atual = byOperator.get(pausaAtiva.operatorName) ?? { pauseEvents: 0, pauseMinutes: 0 }
          atual.pauseMinutes += minutes
          byOperator.set(pausaAtiva.operatorName, atual)
        }
      }
    }
  }

  return { byMachine, byOperator }
}

export function calcularDesempenhoMaquinas(params: {
  ordens: Ordem[]
  eventos: EventoMonitoramento[]
  maquinas: Array<{ id: string; nome: string; ativa: boolean }>
  rangeStartMs: number
  rangeEndMs: number
  agoraMs?: number
}): MachinePerformance[] {
  const { ordens, eventos, maquinas, rangeStartMs, rangeEndMs, agoraMs = Date.now() } = params
  const pausas = calcularPausasNoPeriodo(eventos, rangeStartMs, rangeEndMs, agoraMs)
  const totalPeriodMinutes = Math.max(1, (rangeEndMs - rangeStartMs) / 60000)

  return maquinas
    .filter((maquina) => maquina.ativa)
    .map((maquina) => {
      const ordensMaquina = ordens.filter((ordem) => ordem.etapa === 'envase' && ordem.maquina_id === maquina.id)
      const ordensComTempo = ordensMaquina.filter((ordem) => obterTempoProducaoMin(ordem, agoraMs) > 0)
      const concluidas = ordensMaquina.filter((ordem) => isCompletedOrder(ordem))
      const pausadas = ordensMaquina.filter((ordem) => ordem.status === 'pausada')
      const ativas = ordensMaquina.filter((ordem) => isActiveOrder(ordem))
      const plannedMinutes = ordensMaquina.reduce((acc, ordem) => acc + getOrderPlannedMinutes(ordem), 0)
      const actualMinutes = ordensMaquina.reduce((acc, ordem) => acc + obterTempoProducaoMin(ordem, agoraMs), 0)
      const pauseMinutes = pausas.byMachine.get(maquina.id) ?? 0
      const idleMinutes = Math.max(totalPeriodMinutes - actualMinutes - pauseMinutes, 0)
      const outputLiters = ordensMaquina.reduce((acc, ordem) => acc + getOrderOutputLiters(ordem), 0)
      const averageCycleMinutes =
        concluidas.length > 0
          ? concluidas.reduce((acc, ordem) => acc + obterTempoProducaoMin(ordem, agoraMs), 0) / concluidas.length
          : 0
      const averageDelayMinutes =
        ordensComTempo.length > 0
          ? ordensComTempo.reduce((acc, ordem) => {
              const planned = getOrderPlannedMinutes(ordem)
              const actual = obterTempoProducaoMin(ordem, agoraMs)
              return acc + Math.max(actual - planned, 0)
            }, 0) / ordensComTempo.length
          : 0
      const onTimeBase = concluidas.filter((ordem) => getOrderPlannedMinutes(ordem) > 0)
      const onTimeRate =
        onTimeBase.length > 0
          ? (onTimeBase.filter((ordem) => finishedOnTime(ordem)).length / onTimeBase.length) * 100
          : 0

      return {
        machineId: maquina.id,
        machineName: maquina.nome,
        totalOrders: ordensMaquina.length,
        activeOrders: ativas.length,
        pausedOrders: pausadas.length,
        completedOrders: concluidas.length,
        outputLiters,
        plannedMinutes,
        actualMinutes,
        pauseMinutes,
        idleMinutes,
        averageCycleMinutes,
        averageDelayMinutes,
        onTimeRate,
        utilizationRate: Math.min(100, (actualMinutes / totalPeriodMinutes) * 100),
      }
    })
    .sort((a, b) => b.utilizationRate - a.utilizationRate || b.completedOrders - a.completedOrders)
}

export function calcularDesempenhoOperadores(params: {
  ordens: Ordem[]
  eventos: EventoMonitoramento[]
  agoraMs?: number
}): OperatorPerformance[] {
  const { ordens, eventos, agoraMs = Date.now() } = params
  const rangeStartMs = Math.min(...eventos.map((evento) => toMs(evento.timestamp) ?? Number.MAX_SAFE_INTEGER), agoraMs)
  const rangeEndMs = Math.max(...eventos.map((evento) => toMs(evento.timestamp) ?? 0), agoraMs)
  const pausas = calcularPausasNoPeriodo(
    eventos,
    Number.isFinite(rangeStartMs) ? rangeStartMs : agoraMs,
    Number.isFinite(rangeEndMs) ? rangeEndMs : agoraMs,
    agoraMs
  )

  const grouped = new Map<string, Ordem[]>()
  for (const ordem of ordens) {
    const operatorName = ordem.operador_nome?.trim()
    if (!operatorName) continue
    const lista = grouped.get(operatorName) ?? []
    lista.push(ordem)
    grouped.set(operatorName, lista)
  }

  return Array.from(grouped.entries())
    .map(([operatorName, ordensOperador]) => {
      const concluidas = ordensOperador.filter((ordem) => isCompletedOrder(ordem))
      const ativas = ordensOperador.filter((ordem) => isActiveOrder(ordem))
      const actualMinutes = ordensOperador.reduce((acc, ordem) => acc + obterTempoProducaoMin(ordem, agoraMs), 0)
      const plannedMinutes = ordensOperador.reduce((acc, ordem) => acc + getOrderPlannedMinutes(ordem), 0)
      const outputLiters = ordensOperador.reduce((acc, ordem) => acc + getOrderOutputLiters(ordem), 0)
      const averageCycleMinutes =
        concluidas.length > 0
          ? concluidas.reduce((acc, ordem) => acc + obterTempoProducaoMin(ordem, agoraMs), 0) / concluidas.length
          : 0
      const averageDelayMinutes =
        concluidas.length > 0
          ? concluidas.reduce((acc, ordem) => {
              const planned = getOrderPlannedMinutes(ordem)
              const actual = obterTempoProducaoMin(ordem, agoraMs)
              return acc + Math.max(actual - planned, 0)
            }, 0) / concluidas.length
          : 0
      const onTimeBase = concluidas.filter((ordem) => getOrderPlannedMinutes(ordem) > 0)
      const onTimeRate =
        onTimeBase.length > 0
          ? (onTimeBase.filter((ordem) => finishedOnTime(ordem)).length / onTimeBase.length) * 100
          : 0

      return {
        operatorName,
        completedOrders: concluidas.length,
        activeOrders: ativas.length,
        outputLiters,
        actualMinutes,
        plannedMinutes,
        averageCycleMinutes,
        averageDelayMinutes,
        onTimeRate,
        efficiencyRate:
          actualMinutes > 0 && plannedMinutes > 0 ? Math.min(140, (plannedMinutes / actualMinutes) * 100) : 0,
        pauseEvents: pausas.byOperator.get(operatorName)?.pauseEvents ?? 0,
        pauseMinutes: pausas.byOperator.get(operatorName)?.pauseMinutes ?? 0,
      }
    })
    .sort((a, b) => {
      if (b.onTimeRate !== a.onTimeRate) return b.onTimeRate - a.onTimeRate
      if (b.efficiencyRate !== a.efficiencyRate) return b.efficiencyRate - a.efficiencyRate
      return b.completedOrders - a.completedOrders
    })
}
