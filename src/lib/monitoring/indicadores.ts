import type { Ordem } from '@/types'

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

function toMs(dataIso: string | null | undefined): number | null {
  if (!dataIso) return null
  const t = new Date(dataIso).getTime()
  return Number.isFinite(t) ? t : null
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
