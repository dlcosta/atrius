import { describe, expect, it } from 'vitest'
import {
  inferirEtapa,
  unidadeEhLitro,
  normalizarUnidade,
  mapearVolumeReferenciaPorOrdem,
  obterVolumeReferenciaLitros,
} from '@/lib/ordens/volume'

describe('volume — inferencia de etapa e unidade', () => {
  it('normaliza unidade (trim + upper)', () => {
    expect(normalizarUnidade(' lt ')).toBe('LT')
    expect(normalizarUnidade(null)).toBe('')
  })

  it('reconhece unidades de litro', () => {
    expect(unidadeEhLitro('L')).toBe(true)
    expect(unidadeEhLitro('litros')).toBe(true)
    expect(unidadeEhLitro('CX')).toBe(false)
  })

  it('infere tanque por prefixo TQ no SKU', () => {
    expect(inferirEtapa('TQ-001', 'CX')).toBe('tanque')
  })

  it('infere tanque por unidade em litros', () => {
    expect(inferirEtapa('SKU-1', 'L')).toBe('tanque')
  })

  it('infere envase por padrao', () => {
    expect(inferirEtapa('SKU-1', 'CX')).toBe('envase')
  })
})

describe('volume — mapeamento de volume de referencia por lote', () => {
  it('mantem a quantidade quando nao ha lote', () => {
    const map = mapearVolumeReferenciaPorOrdem([
      { id: 'a', quantidade: 100, unidade: 'CX', lote: null, etapa: 'envase' },
    ])
    expect(map.a).toBe(100)
  })

  it('distribui o volume do tanque proporcionalmente entre os envases do mesmo lote', () => {
    const map = mapearVolumeReferenciaPorOrdem([
      { id: 't', quantidade: 3000, unidade: 'L', lote: 'L1', etapa: 'tanque' },
      { id: 'e1', quantidade: 2, unidade: 'CX', lote: 'L1', etapa: 'envase' },
      { id: 'e2', quantidade: 1, unidade: 'CX', lote: 'L1', etapa: 'envase' },
    ])
    // 3000L distribuido 2:1 → 2000 / 1000
    expect(map.e1).toBeCloseTo(2000, 5)
    expect(map.e2).toBeCloseTo(1000, 5)
  })

  it('nao redistribui quando o lote so tem tanque (sem envase)', () => {
    const map = mapearVolumeReferenciaPorOrdem([
      { id: 't', quantidade: 3000, unidade: 'L', lote: 'L1', etapa: 'tanque' },
    ])
    expect(map.t).toBe(3000)
  })

  it('obterVolumeReferenciaLitros faz fallback para a quantidade', () => {
    const ordem = { id: 'x', quantidade: 50, unidade: 'CX', lote: null, etapa: 'envase' as const }
    expect(obterVolumeReferenciaLitros(ordem, {})).toBe(50)
  })
})
