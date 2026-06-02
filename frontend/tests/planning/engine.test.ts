import { describe, it, expect } from 'vitest'
import {
  calcularDuracao,
  calcularFim,
  detectarConflito,
  ordenarPorInicio,
  ordemParaBlocos,
} from '@/lib/planning/engine'
import type { Ordem, Produto } from '@/types'

const produto: Produto = {
  id: 'p1',
  sku: '925',
  nome: 'Desinfetante 5L Marine',
  volume_base: 3800,
  tempo_limpeza_min: 30,
  tempos_maquinas: {
    maq1: { setup: 40, producao: 60 },
  },
  cor: '#C8E6C9',
  criado_em: '2026-01-01T00:00:00Z',
}

const ordemBase: Ordem = {
  id: 'o1',
  numero_externo: '31389',
  produto_sku: '925',
  maquina_id: 'maq1',
  quantidade: 190,
  unidade: 'FD',
  tanque: 'tq3',
  lote: 'lt906',
  etapa: 'envase',
  data_prevista: '2026-04-06',
  inicio_agendado: '2026-04-06T07:00:00Z',
  fim_calculado: '2026-04-06T08:40:00Z',
  quantidade_referencia_litros: 3800,
  status: 'aguardando',
  sincronizado_em: '2026-04-06T00:00:00Z',
  produto,
}

describe('calcularDuracao', () => {
  it('calcula setup + producao proporcional ao volume base', () => {
    expect(calcularDuracao(3800, 3800, 40, 60)).toBe(100)
  })

  it('retorna apenas setup quando volume referencia e invalido', () => {
    expect(calcularDuracao(0, 3800, 40, 60)).toBe(40)
  })
})

describe('calcularFim', () => {
  it('adiciona minutos ao inicio', () => {
    const inicio = new Date('2026-04-06T07:00:00Z')
    const fim = calcularFim(inicio, 120)
    expect(fim.toISOString()).toBe('2026-04-06T09:00:00.000Z')
  })
})

describe('detectarConflito', () => {
  it('retorna false quando nao ha sobreposicao', () => {
    const ordemB: Ordem = {
      ...ordemBase,
      id: 'o2',
      inicio_agendado: '2026-04-06T08:40:00Z',
      fim_calculado: '2026-04-06T10:00:00Z',
    }
    expect(detectarConflito(ordemBase, [ordemB])).toBe(false)
  })

  it('retorna true quando ha sobreposicao', () => {
    const ordemB: Ordem = {
      ...ordemBase,
      id: 'o2',
      inicio_agendado: '2026-04-06T08:00:00Z',
      fim_calculado: '2026-04-06T10:00:00Z',
    }
    expect(detectarConflito(ordemBase, [ordemB])).toBe(true)
  })
})

describe('ordenarPorInicio', () => {
  it('ordena ordens por inicio_agendado ascendente', () => {
    const ordens: Ordem[] = [
      { ...ordemBase, id: 'o2', inicio_agendado: '2026-04-06T09:00:00Z' },
      { ...ordemBase, id: 'o1', inicio_agendado: '2026-04-06T07:00:00Z' },
      { ...ordemBase, id: 'o3', inicio_agendado: null, fim_calculado: null },
    ]
    const result = ordenarPorInicio(ordens)
    expect(result[0].id).toBe('o1')
    expect(result[1].id).toBe('o2')
    expect(result[2].id).toBe('o3')
  })
})

describe('ordemParaBlocos', () => {
  it('retorna preparacao unificada e producao', () => {
    const blocos = ordemParaBlocos(ordemBase)
    expect(blocos).toHaveLength(2)
    expect(blocos[0].tipo).toBe('setup')
    expect(blocos[0].produto).toBe('Preparação - Desinfetante 5L Marine')
    expect(blocos[0].duracao_min).toBe(70)
    expect(blocos[1].tipo).toBe('producao')
  })

  it('retorna vazio se ordem nao tiver maquina', () => {
    const ordemSemMaquina = { ...ordemBase, maquina_id: null }
    expect(ordemParaBlocos(ordemSemMaquina)).toHaveLength(0)
  })
})
