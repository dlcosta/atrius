import { describe, expect, it } from 'vitest'
import { validarNovaOrdem } from '@/lib/ordens/criar-ordem'

describe('validarNovaOrdem', () => {
  it('retorna erro quando produto_sku esta vazio', () => {
    const resultado = validarNovaOrdem({
      produto_sku: '',
      quantidade: 100,
      unidade: 'L',
      data_prevista: '2026-05-14',
      etapa: 'tanque',
      tank_id: 'tank-3800',
      setup_time_minutes: 0,
      production_time_minutes: 10,
      cleaning_time_minutes: 0,
    })
    expect(resultado.erro).toBe('Produto obrigatorio')
  })

  it('retorna erro quando data_prevista nao for informada', () => {
    const resultado = validarNovaOrdem({
      produto_sku: 'AMACIANTE-2L',
      quantidade: 100,
      unidade: 'L',
      data_prevista: null,
      etapa: 'tanque',
      tank_id: 'tank-3800',
      setup_time_minutes: 0,
      production_time_minutes: 10,
      cleaning_time_minutes: 0,
    })
    expect(resultado.erro).toBe('Data prevista obrigatoria')
  })

  it('retorna erro quando origem de tanque nao for informada no envase', () => {
    const resultado = validarNovaOrdem({
      produto_sku: 'AMACIANTE-2L',
      quantidade: 100,
      unidade: 'L',
      data_prevista: '2026-05-14',
      etapa: 'envase',
      machine_id: 'maq-1',
      setup_time_minutes: 0,
      production_time_minutes: 10,
      cleaning_time_minutes: 0,
    })
    expect(resultado.erro).toBe('Origem de tanque obrigatoria para envase')
  })

  it('retorna erro quando maquina nao for informada no envase', () => {
    const resultado = validarNovaOrdem({
      produto_sku: 'AMACIANTE-2L',
      quantidade: 100,
      unidade: 'L',
      data_prevista: '2026-05-14',
      etapa: 'envase',
      origin_tank_order_id: 'tank-order-1',
      setup_time_minutes: 0,
      production_time_minutes: 10,
      cleaning_time_minutes: 0,
    })
    expect(resultado.erro).toBe('Maquina obrigatoria para envase')
  })

  it('retorna valido quando todos os campos estao corretos no envase', () => {
    const resultado = validarNovaOrdem({
      produto_sku: 'AMACIANTE-2L',
      quantidade: 100,
      unidade: 'L',
      data_prevista: '2026-05-14',
      etapa: 'envase',
      machine_id: 'maq-1',
      origin_tank_order_id: 'tank-order-1',
      setup_time_minutes: 10,
      production_time_minutes: 20,
      cleaning_time_minutes: 5,
    })
    expect(resultado.erro).toBeUndefined()
    expect(resultado.valido).toBe(true)
  })
})
