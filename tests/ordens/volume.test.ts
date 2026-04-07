import { describe, expect, it } from 'vitest'
import {
  inferirEtapa,
  mapearVolumeReferenciaPorOrdem,
  obterVolumeReferenciaLitros,
  unidadeEhLitro,
} from '@/lib/ordens/volume'

describe('inferirEtapa', () => {
  it('marca tanque quando SKU inicia com TQ', () => {
    expect(inferirEtapa('TQ0001', 'L')).toBe('tanque')
  })

  it('marca tanque quando unidade esta em litros', () => {
    expect(inferirEtapa('925', 'L')).toBe('tanque')
  })

  it('marca envase para unidades de expedicao', () => {
    expect(inferirEtapa('925', 'FD')).toBe('envase')
  })

  it('normaliza unidades de litro variantes', () => {
    expect(unidadeEhLitro('lt')).toBe(true)
    expect(unidadeEhLitro('litros')).toBe(true)
  })
})

describe('mapearVolumeReferenciaPorOrdem', () => {
  it('distribui volume do tanque para ordens de envase do mesmo lote', () => {
    const ordens = [
      { id: 't1', quantidade: 3800, unidade: 'L', lote: 'lt906', etapa: 'tanque' as const },
      { id: 'e1', quantidade: 190, unidade: 'FD', lote: 'lt906', etapa: 'envase' as const },
    ]

    const mapa = mapearVolumeReferenciaPorOrdem(ordens)
    expect(mapa.e1).toBeCloseTo(3800)
    expect(mapa.t1).toBeCloseTo(3800)
  })

  it('divide proporcionalmente quando ha mais de uma ordem de envase', () => {
    const ordens = [
      { id: 't1', quantidade: 3800, unidade: 'L', lote: 'lt100', etapa: 'tanque' as const },
      { id: 'e1', quantidade: 95, unidade: 'FD', lote: 'lt100', etapa: 'envase' as const },
      { id: 'e2', quantidade: 95, unidade: 'FD', lote: 'lt100', etapa: 'envase' as const },
    ]

    const mapa = mapearVolumeReferenciaPorOrdem(ordens)
    expect(mapa.e1).toBeCloseTo(1900)
    expect(mapa.e2).toBeCloseTo(1900)
  })

  it('mantem fallback para ordens sem lote', () => {
    const ordem = { id: 'e1', quantidade: 120, unidade: 'FD', lote: null, etapa: 'envase' as const }
    const mapa = mapearVolumeReferenciaPorOrdem([ordem])
    expect(obterVolumeReferenciaLitros(ordem, mapa)).toBe(120)
  })
})
