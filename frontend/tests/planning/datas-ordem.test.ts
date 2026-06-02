import { describe, expect, it } from 'vitest'
import { mesmoDia, pertenceAoDia } from '@/lib/planning/datas-ordem'
import type { Ordem } from '@/types'

function ordem(partial: Partial<Ordem>): Ordem {
  return {
    id: '1', numero_externo: 'MAN-1', produto_sku: 'SKU', maquina_id: null,
    quantidade: 1, unidade: 'L', tanque: null, lote: null, etapa: 'tanque',
    data_prevista: null, inicio_agendado: null, fim_calculado: null,
    status: 'aguardando', sincronizado_em: '2026-06-01T00:00:00.000Z', tank_id: null,
    ...partial,
  } as Ordem
}

describe('datas-ordem', () => {
  it('mesmoDia compara o dia local da ISO com o YMD', () => {
    // meio-dia local: o dia formatado bate em qualquer fuso razoavel
    const meioDiaLocal = new Date(2026, 5, 2, 12, 0, 0).toISOString()
    expect(mesmoDia(meioDiaLocal, '2026-06-02')).toBe(true)
    expect(mesmoDia(meioDiaLocal, '2026-06-03')).toBe(false)
    expect(mesmoDia(null, '2026-06-02')).toBe(false)
  })

  it('pertenceAoDia casa por data_prevista', () => {
    expect(pertenceAoDia(ordem({ data_prevista: '2026-06-02' }), '2026-06-02')).toBe(true)
    expect(pertenceAoDia(ordem({ data_prevista: '2026-06-01' }), '2026-06-02')).toBe(false)
  })

  it('pertenceAoDia casa por inicio_agendado mesmo com data_prevista divergente', () => {
    const o = ordem({ data_prevista: '2026-06-01', inicio_agendado: new Date(2026, 5, 2, 7, 45).toISOString() })
    expect(pertenceAoDia(o, '2026-06-02')).toBe(true)
  })

  it('pertenceAoDia casa por inicio/fim de operacao', () => {
    const o = ordem({ fim_operacao_em: new Date(2026, 5, 2, 9, 0).toISOString() })
    expect(pertenceAoDia(o, '2026-06-02')).toBe(true)
  })
})
