import { describe, it, expect } from 'vitest'
import { validarNovaOrdem } from '@/lib/ordens/criar-ordem'

describe('validarNovaOrdem', () => {
  it('retorna erro quando produto_sku esta vazio', () => {
    const resultado = validarNovaOrdem({
      produto_sku: '',
      quantidade: 100,
      unidade: 'UN',
      data_prevista: '2026-04-06',
    })
    expect(resultado.erro).toBe('Produto obrigatorio')
  })

  it('retorna erro quando quantidade e zero', () => {
    const resultado = validarNovaOrdem({
      produto_sku: 'AMACIANTE-2L',
      quantidade: 0,
      unidade: 'UN',
      data_prevista: '2026-04-06',
    })
    expect(resultado.erro).toBe('Quantidade deve ser maior que zero')
  })

  it('retorna erro quando data_prevista esta vazia', () => {
    const resultado = validarNovaOrdem({
      produto_sku: 'AMACIANTE-2L',
      quantidade: 100,
      unidade: 'UN',
      data_prevista: '',
    })
    expect(resultado.erro).toBe('Data prevista obrigatoria')
  })

  it('retorna erro quando data_prevista tem formato invalido', () => {
    const resultado = validarNovaOrdem({
      produto_sku: 'AMACIANTE-2L',
      quantidade: 100,
      unidade: 'UN',
      data_prevista: '06/04/2026',
    })
    expect(resultado.erro).toBe('Data prevista invalida (use YYYY-MM-DD)')
  })

  it('retorna valido quando todos os campos estao corretos', () => {
    const resultado = validarNovaOrdem({
      produto_sku: 'AMACIANTE-2L',
      quantidade: 100,
      unidade: 'UN',
      data_prevista: '2026-04-06',
    })
    expect(resultado.erro).toBeUndefined()
    expect(resultado.valido).toBe(true)
  })

  it('normaliza a unidade para maiusculo', () => {
    const resultado = validarNovaOrdem({
      produto_sku: 'AMACIANTE-2L',
      quantidade: 50,
      unidade: 'fd',
      data_prevista: '2026-04-06',
    })
    expect(resultado.erro).toBeUndefined()
    expect(resultado.dadosNormalizados?.unidade).toBe('FD')
  })
})
