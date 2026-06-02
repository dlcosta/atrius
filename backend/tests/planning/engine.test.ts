import { describe, expect, it } from 'vitest'
import { calcularDuracao, calcularFim, detectarConflito, ordenarPorInicio } from '@/lib/planning/engine'
import type { Ordem } from '@/types'

function ordem(partial: Partial<Ordem>): Ordem {
  return {
    id: partial.id ?? '1', numero_externo: 'MAN-1', produto_sku: 'SKU', maquina_id: partial.maquina_id ?? 'maq-1',
    quantidade: 3800, unidade: 'L', tanque: null, lote: null, etapa: partial.etapa ?? 'envase',
    data_prevista: '2026-05-14', inicio_agendado: partial.inicio_agendado ?? null, fim_calculado: partial.fim_calculado ?? null,
    status: 'aguardando', sincronizado_em: '2026-05-14T00:00:00.000Z', tank_id: partial.tank_id ?? null,
  } as Ordem
}

describe('engine — calcularDuracao', () => {
  it('escala producao pelo volume de referencia + setup', () => {
    // 3800L / 3800 base * 60min + 10 setup = 70
    expect(calcularDuracao(3800, 3800, 10, 60)).toBe(70)
  })

  it('retorna apenas setup quando litros <= 0', () => {
    expect(calcularDuracao(0, 3800, 10, 60)).toBe(10)
  })

  it('retorna apenas setup quando producao <= 0', () => {
    expect(calcularDuracao(3800, 3800, 10, 0)).toBe(10)
  })

  it('usa volume_base padrao 3800 quando zero', () => {
    expect(calcularDuracao(1900, 0, 0, 60)).toBe(30)
  })
})

describe('engine — calcularFim', () => {
  it('soma a duracao em minutos', () => {
    expect(calcularFim(new Date('2026-05-14T07:00:00.000Z'), 90).toISOString()).toBe('2026-05-14T08:30:00.000Z')
  })
})

describe('engine — detectarConflito', () => {
  it('retorna false sem inicio/fim na candidata', () => {
    expect(detectarConflito(ordem({}), [])).toBe(false)
  })

  it('detecta sobreposicao na mesma maquina', () => {
    const candidata = ordem({ inicio_agendado: '2026-05-14T07:30:00.000Z', fim_calculado: '2026-05-14T08:30:00.000Z' })
    const existentes = [ordem({ id: '2', inicio_agendado: '2026-05-14T07:00:00.000Z', fim_calculado: '2026-05-14T08:00:00.000Z' })]
    expect(detectarConflito(candidata, existentes)).toBe(true)
  })

  it('ignora a propria ordem', () => {
    const candidata = ordem({ id: '1', inicio_agendado: '2026-05-14T07:30:00.000Z', fim_calculado: '2026-05-14T08:30:00.000Z' })
    expect(detectarConflito(candidata, [candidata])).toBe(false)
  })
})

describe('engine — ordenarPorInicio', () => {
  it('ordena por inicio_agendado com nulos no fim', () => {
    const a = ordem({ id: 'a', inicio_agendado: '2026-05-14T09:00:00.000Z' })
    const b = ordem({ id: 'b', inicio_agendado: '2026-05-14T07:00:00.000Z' })
    const c = ordem({ id: 'c', inicio_agendado: null })
    expect(ordenarPorInicio([a, b, c]).map((o) => o.id)).toEqual(['b', 'a', 'c'])
  })
})
