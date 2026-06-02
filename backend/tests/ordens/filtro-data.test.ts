import { describe, expect, it } from 'vitest'
import {
  isDateInRange,
  isDateOnlyInRange,
  ordemPertenceAoDia,
} from '@/lib/ordens/filtro-data'

describe('filtro-data — helpers base', () => {
  it('isDateOnlyInRange compara strings YYYY-MM-DD inclusivamente', () => {
    expect(isDateOnlyInRange('2026-06-02', '2026-06-01', '2026-06-03')).toBe(true)
    expect(isDateOnlyInRange('2026-06-01', '2026-06-01', '2026-06-03')).toBe(true)
    expect(isDateOnlyInRange('2026-06-03', '2026-06-01', '2026-06-03')).toBe(true)
    expect(isDateOnlyInRange('2026-06-04', '2026-06-01', '2026-06-03')).toBe(false)
    expect(isDateOnlyInRange(null, '2026-06-01', '2026-06-03')).toBe(false)
  })

  it('isDateInRange usa limites em ms', () => {
    const inicio = Date.parse('2026-06-02T00:00:00.000Z')
    const fim = Date.parse('2026-06-02T23:59:59.999Z')
    expect(isDateInRange('2026-06-02T07:45:00.000Z', inicio, fim)).toBe(true)
    expect(isDateInRange('2026-06-03T00:00:00.000Z', inicio, fim)).toBe(false)
    expect(isDateInRange(null, inicio, fim)).toBe(false)
  })
})

describe('filtro-data — ordemPertenceAoDia (regressao do dashboard)', () => {
  it('inclui ordem cujo inicio_agendado cai no dia, mesmo com data_prevista diferente', () => {
    // Bug original: ordem agendada para 02/06 07:45 nao aparecia ao filtrar por data=02/06
    // porque data_prevista ainda era 01/06.
    const ordem = { data_prevista: '2026-06-01', inicio_agendado: '2026-06-02T07:45:00.000Z' }
    expect(ordemPertenceAoDia(ordem, '2026-06-02')).toBe(true)
    expect(ordemPertenceAoDia(ordem, '2026-06-01')).toBe(true) // por data_prevista
  })

  it('inclui por data_prevista quando nao ha inicio_agendado', () => {
    const ordem = { data_prevista: '2026-06-02', inicio_agendado: null }
    expect(ordemPertenceAoDia(ordem, '2026-06-02')).toBe(true)
    expect(ordemPertenceAoDia(ordem, '2026-06-03')).toBe(false)
  })

  it('exclui ordem de outro dia', () => {
    const ordem = { data_prevista: '2026-06-05', inicio_agendado: '2026-06-05T08:00:00.000Z' }
    expect(ordemPertenceAoDia(ordem, '2026-06-02')).toBe(false)
  })
})
