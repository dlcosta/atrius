import { describe, expect, it } from 'vitest'
import { validarNovaOrdem } from '@/lib/ordens/criar-ordem'

const base = {
  produto_sku: 'SKU-1',
  liters: 3000,
  data_prevista: '2026-06-02',
  setup_time_minutes: 10,
  production_time_minutes: 60,
  cleaning_time_minutes: 0,
}

describe('validarNovaOrdem', () => {
  it('aceita ordem válida e normaliza unidade', () => {
    const r = validarNovaOrdem({ ...base, unidade: 'l' })
    expect(r.valido).toBe(true)
    expect(r.dadosNormalizados?.unidade).toBe('L')
  })

  it('exige produto_sku', () => {
    expect(validarNovaOrdem({ ...base, produto_sku: '' }).erro).toMatch(/Produto/)
  })

  it('exige litros > 0', () => {
    expect(validarNovaOrdem({ ...base, liters: 0 }).erro).toMatch(/Litros/)
  })

  it('production_time_minutes deve ser > 0', () => {
    expect(validarNovaOrdem({ ...base, production_time_minutes: 0 }).erro).toMatch(/productionTimeMinutes/)
  })

  it('tanque exige tank_id', () => {
    expect(validarNovaOrdem({ ...base, etapa: 'tanque' }).erro).toMatch(/Tanque/)
    expect(validarNovaOrdem({ ...base, etapa: 'tanque', tank_id: 'tank-1' }).valido).toBe(true)
  })

  it('envase exige origem de tanque e máquina', () => {
    expect(validarNovaOrdem({ ...base, etapa: 'envase' }).erro).toMatch(/Origem de tanque/)
    expect(validarNovaOrdem({ ...base, etapa: 'envase', origin_tank_order_id: 'o1' }).erro).toMatch(/Máquina/)
    expect(validarNovaOrdem({ ...base, etapa: 'envase', origin_tank_order_id: 'o1', machine_id: 'm1' }).valido).toBe(true)
  })

  it('data_prevista deve casar com YYYY-MM-DD', () => {
    expect(validarNovaOrdem({ ...base, data_prevista: '02/06/2026' }).erro).toMatch(/inválida/)
    expect(validarNovaOrdem({ ...base, data_prevista: null }).erro).toMatch(/obrigatória/)
  })

  it('rejeita package_volume_liters/units_per_box <= 0 quando informados', () => {
    expect(validarNovaOrdem({ ...base, package_volume_liters: 0 }).erro).toMatch(/packageVolumeLiters/)
    expect(validarNovaOrdem({ ...base, units_per_box: 0 }).erro).toMatch(/unitsPerBox/)
  })
})
