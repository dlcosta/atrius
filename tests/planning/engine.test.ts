import { describe, it, expect } from 'vitest'
import {
  calcularFim,
  detectarConflito,
  gerarBlocoLimpeza,
  ordenarPorInicio,
  ordemParaBlocos,
} from '@/lib/planning/engine'
import type { Ordem, Produto, BlocoGantt } from '@/types'

const produto: Produto = {
  id: 'p1',
  sku: 'AMACIANTE-2L',
  nome: 'Amaciante 2L',
  tempo_producao_min: 120,
  tempo_limpeza_min: 30,
  cor: '#C8E6C9',
  criado_em: '2026-01-01T00:00:00Z',
}

const ordemBase: Ordem = {
  id: 'o1',
  numero_externo: '31389',
  produto_sku: 'AMACIANTE-2L',
  maquina_id: 'maq1',
  quantidade: 190,
  unidade: 'FD',
  data_prevista: '2026-04-06',
  inicio_agendado: '2026-04-06T07:00:00Z',
  fim_calculado: '2026-04-06T09:00:00Z',
  status: 'aguardando',
  sincronizado_em: '2026-04-06T00:00:00Z',
  produto,
}

describe('calcularFim', () => {
  it('adiciona tempo_producao_min ao inicio_agendado', () => {
    const inicio = new Date('2026-04-06T07:00:00Z')
    const fim = calcularFim(inicio, 120)
    expect(fim.toISOString()).toBe('2026-04-06T09:00:00.000Z')
  })

  it('funciona com 30 minutos', () => {
    const inicio = new Date('2026-04-06T10:00:00Z')
    const fim = calcularFim(inicio, 30)
    expect(fim.toISOString()).toBe('2026-04-06T10:30:00.000Z')
  })
})

describe('detectarConflito', () => {
  it('retorna false quando não há sobreposição', () => {
    const ordemB: Ordem = {
      ...ordemBase,
      id: 'o2',
      inicio_agendado: '2026-04-06T09:00:00Z',
      fim_calculado: '2026-04-06T11:00:00Z',
    }
    expect(detectarConflito(ordemBase, [ordemB])).toBe(false)
  })

  it('retorna true quando há sobreposição', () => {
    const ordemB: Ordem = {
      ...ordemBase,
      id: 'o2',
      inicio_agendado: '2026-04-06T08:00:00Z',
      fim_calculado: '2026-04-06T10:00:00Z',
    }
    expect(detectarConflito(ordemBase, [ordemB])).toBe(true)
  })

  it('ignora a própria ordem na lista', () => {
    expect(detectarConflito(ordemBase, [ordemBase])).toBe(false)
  })

  it('retorna false quando ordens são de máquinas diferentes', () => {
    const ordemB: Ordem = {
      ...ordemBase,
      id: 'o2',
      maquina_id: 'maq2',
      inicio_agendado: '2026-04-06T08:00:00Z',
      fim_calculado: '2026-04-06T10:00:00Z',
    }
    expect(detectarConflito(ordemBase, [ordemB])).toBe(false)
  })

  it('retorna false quando ordem candidata não tem inicio_agendado', () => {
    const ordemSemHorario: Ordem = { ...ordemBase, inicio_agendado: null, fim_calculado: null }
    expect(detectarConflito(ordemSemHorario, [ordemBase])).toBe(false)
  })
})

describe('gerarBlocoLimpeza', () => {
  it('gera bloco de limpeza após o fim da produção', () => {
    const bloco = gerarBlocoLimpeza(ordemBase, produto)
    expect(bloco).not.toBeNull()
    expect(bloco!.tipo).toBe('limpeza')
    expect(bloco!.inicio.toISOString()).toBe('2026-04-06T09:00:00.000Z')
    expect(bloco!.fim.toISOString()).toBe('2026-04-06T09:30:00.000Z')
    expect(bloco!.ordemId).toBe('o1')
  })

  it('retorna null se tempo_limpeza_min for 0', () => {
    const produtoSemLimpeza = { ...produto, tempo_limpeza_min: 0 }
    expect(gerarBlocoLimpeza(ordemBase, produtoSemLimpeza)).toBeNull()
  })

  it('retorna null se ordem não tiver fim_calculado', () => {
    const ordemSemFim = { ...ordemBase, fim_calculado: null }
    expect(gerarBlocoLimpeza(ordemSemFim, produto)).toBeNull()
  })
})

describe('ordenarPorInicio', () => {
  it('ordena ordens por inicio_agendado ascendente', () => {
    const ordens: Ordem[] = [
      { ...ordemBase, id: 'o2', inicio_agendado: '2026-04-06T09:00:00Z' },
      { ...ordemBase, id: 'o1', inicio_agendado: '2026-04-06T07:00:00Z' },
      { ...ordemBase, id: 'o3', inicio_agendado: null },
    ]
    const result = ordenarPorInicio(ordens)
    expect(result[0].id).toBe('o1')
    expect(result[1].id).toBe('o2')
    expect(result[2].id).toBe('o3')
  })
})

describe('ordemParaBlocos', () => {
  it('retorna bloco de produção e limpeza quando produto tem tempo_limpeza_min > 0', () => {
    const blocos = ordemParaBlocos(ordemBase)
    expect(blocos).toHaveLength(2)
    expect(blocos[0].tipo).toBe('producao')
    expect(blocos[0].id).toBe('o1')
    expect(blocos[1].tipo).toBe('limpeza')
    expect(blocos[1].id).toBe('limpeza-o1')
  })

  it('retorna apenas bloco de produção quando tempo_limpeza_min é 0', () => {
    const produtoSemLimpeza = { ...produto, tempo_limpeza_min: 0 }
    const ordemSemLimpeza = { ...ordemBase, produto: produtoSemLimpeza }
    const blocos = ordemParaBlocos(ordemSemLimpeza)
    expect(blocos).toHaveLength(1)
    expect(blocos[0].tipo).toBe('producao')
  })

  it('retorna array vazio quando maquina_id é null', () => {
    const ordemSemMaquina = { ...ordemBase, maquina_id: null }
    expect(ordemParaBlocos(ordemSemMaquina)).toHaveLength(0)
  })

  it('retorna array vazio quando inicio_agendado é null', () => {
    const ordemSemHorario = { ...ordemBase, inicio_agendado: null, fim_calculado: null }
    expect(ordemParaBlocos(ordemSemHorario)).toHaveLength(0)
  })
})
