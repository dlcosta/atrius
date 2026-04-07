import { describe, expect, it } from 'vitest'
import type { Ordem } from '@/types'
import {
  calcularMediaTempoPorProduto,
  calcularTempoRestanteMs,
  calcularIndicadores,
  formatarDuracaoRelogio,
  formatarMinutos,
  obterQuantidadeProduzidaEstimada,
  obterTempoProducaoMin,
} from '@/lib/monitoring/indicadores'

const baseMs = new Date('2026-04-07T12:00:00Z').getTime()

function criarOrdem(partial: Partial<Ordem>): Ordem {
  return {
    id: partial.id ?? 'o1',
    numero_externo: partial.numero_externo ?? '31389',
    produto_sku: partial.produto_sku ?? '925',
    maquina_id: partial.maquina_id ?? 'm1',
    quantidade: partial.quantidade ?? 100,
    unidade: partial.unidade ?? 'UN',
    tanque: partial.tanque ?? null,
    lote: partial.lote ?? null,
    etapa: partial.etapa ?? 'envase',
    data_prevista: partial.data_prevista ?? '2026-04-07',
    inicio_agendado: partial.inicio_agendado ?? '2026-04-07T10:00:00Z',
    fim_calculado: partial.fim_calculado ?? '2026-04-07T14:00:00Z',
    inicio_operacao_em: partial.inicio_operacao_em ?? null,
    fim_operacao_em: partial.fim_operacao_em ?? null,
    status: partial.status ?? 'aguardando',
    sincronizado_em: partial.sincronizado_em ?? '2026-04-07T00:00:00Z',
  }
}

describe('obterQuantidadeProduzidaEstimada', () => {
  it('retorna quantidade total para ordem concluida', () => {
    const ordem = criarOrdem({ status: 'concluida', quantidade: 80, fim_operacao_em: '2026-04-07T11:00:00Z' })
    expect(obterQuantidadeProduzidaEstimada(ordem, baseMs)).toBe(80)
  })

  it('estima quantidade proporcional ao progresso', () => {
    const ordem = criarOrdem({
      quantidade: 200,
      status: 'produzindo',
      inicio_operacao_em: '2026-04-07T10:00:00Z',
      fim_calculado: '2026-04-07T14:00:00Z',
    })
    expect(obterQuantidadeProduzidaEstimada(ordem, baseMs)).toBeCloseTo(100)
  })
})

describe('obterTempoProducaoMin', () => {
  it('calcula tempo em aberto para ordem em producao', () => {
    const ordem = criarOrdem({
      status: 'produzindo',
      inicio_operacao_em: '2026-04-07T11:00:00Z',
      fim_operacao_em: null,
    })
    expect(obterTempoProducaoMin(ordem, baseMs)).toBe(60)
  })

  it('calcula tempo fechado para ordem concluida', () => {
    const ordem = criarOrdem({
      status: 'concluida',
      inicio_operacao_em: '2026-04-07T08:00:00Z',
      fim_operacao_em: '2026-04-07T10:30:00Z',
    })
    expect(obterTempoProducaoMin(ordem, baseMs)).toBe(150)
  })
})

describe('calcularIndicadores', () => {
  it('agrega indicadores globais', () => {
    const ordens = [
      criarOrdem({
        id: 'o1',
        maquina_id: 'm1',
        quantidade: 100,
        status: 'produzindo',
        inicio_operacao_em: '2026-04-07T10:00:00Z',
        fim_calculado: '2026-04-07T14:00:00Z',
      }),
      criarOrdem({
        id: 'o2',
        maquina_id: 'm2',
        quantidade: 50,
        status: 'concluida',
        inicio_operacao_em: '2026-04-07T08:00:00Z',
        fim_operacao_em: '2026-04-07T09:00:00Z',
        fim_calculado: '2026-04-07T09:10:00Z',
      }),
    ]

    const indicadores = calcularIndicadores(ordens, 3, baseMs)
    expect(indicadores.totalOrdens).toBe(2)
    expect(indicadores.ordensEmProducao).toBe(1)
    expect(indicadores.ordensConcluidas).toBe(1)
    expect(indicadores.quantidadePlanejada).toBe(150)
    expect(indicadores.maquinasProduzindo).toBe(1)
    expect(indicadores.quantidadeProduzidaEstimada).toBe(100)
  })
})

describe('formatarMinutos', () => {
  it('formata minutos em horas e minutos', () => {
    expect(formatarMinutos(75)).toBe('1 h 15 min')
    expect(formatarMinutos(60)).toBe('1 h')
    expect(formatarMinutos(15)).toBe('15 min')
  })
})

describe('timer operacional', () => {
  it('calcula tempo restante em ms', () => {
    const ordem = criarOrdem({
      status: 'produzindo',
      inicio_operacao_em: '2026-04-07T10:00:00Z',
      fim_calculado: '2026-04-07T13:00:00Z',
    })
    expect(calcularTempoRestanteMs(ordem, baseMs)).toBe(3600000)
  })

  it('formata duracao em HH:MM:SS', () => {
    expect(formatarDuracaoRelogio(3661000)).toBe('01:01:01')
  })
})

describe('calcularMediaTempoPorProduto', () => {
  it('calcula media por produto com ordens concluidas', () => {
    const ordens = [
      criarOrdem({
        id: 'a1',
        produto_sku: 'P1',
        produto: {
          id: 'p1',
          sku: 'P1',
          nome: 'Produto A',
          volume_base: 3800,
          tempo_limpeza_min: 0,
          tempos_maquinas: {},
          cor: '#000000',
          criado_em: '2026-04-01T00:00:00Z',
        },
        status: 'concluida',
        inicio_operacao_em: '2026-04-07T08:00:00Z',
        fim_operacao_em: '2026-04-07T09:00:00Z',
      }),
      criarOrdem({
        id: 'a2',
        produto_sku: 'P1',
        produto: {
          id: 'p1',
          sku: 'P1',
          nome: 'Produto A',
          volume_base: 3800,
          tempo_limpeza_min: 0,
          tempos_maquinas: {},
          cor: '#000000',
          criado_em: '2026-04-01T00:00:00Z',
        },
        status: 'concluida',
        inicio_operacao_em: '2026-04-07T10:00:00Z',
        fim_operacao_em: '2026-04-07T11:30:00Z',
      }),
    ]

    const medias = calcularMediaTempoPorProduto(ordens)
    expect(medias).toHaveLength(1)
    expect(medias[0].produtoSku).toBe('P1')
    expect(medias[0].ordensConcluidas).toBe(2)
    expect(medias[0].tempoMedioMin).toBe(75)
  })
})
