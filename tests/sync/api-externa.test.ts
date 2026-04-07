import { describe, it, expect } from 'vitest'
import {
  extrairLote,
  extrairMaquinaId,
  extrairSku,
  extrairTanque,
  transformOrdem,
} from '@/lib/sync/api-externa'

const ordemExterna = {
  numero: '31389',
  data: '2026-04-06',
  data_prevista: '2026-04-06',
  sku: '925',
  descricao: '925 - DESINFETANTE 5L MARINE - FD C/4 UN',
  quantidade: 190,
  unidade: 'FD',
  marcadores: ['lt906', 'tq3', 'mq2'],
  status: 'em aberto',
}

describe('extrairMaquinaId', () => {
  it('extrai o marcador de maquina', () => {
    expect(extrairMaquinaId(['lt906', 'tq3', 'mq2'])).toBe('mq2')
  })

  it('retorna null se nao houver marcador de maquina', () => {
    expect(extrairMaquinaId(['lt906', 'tq3'])).toBeNull()
  })
})

describe('extrairTanque e extrairLote', () => {
  it('extrai tanque e lote dos marcadores', () => {
    expect(extrairTanque(['lt906', 'tq3', 'mq2'])).toBe('tq3')
    expect(extrairLote(['lt906', 'tq3', 'mq2'])).toBe('lt906')
  })

  it('retorna null quando marcadores nao existem', () => {
    expect(extrairTanque(['mq2'])).toBeNull()
    expect(extrairLote(['mq2'])).toBeNull()
  })
})

describe('extrairSku', () => {
  it('extrai o codigo antes do traco', () => {
    expect(extrairSku('925 - DESINFETANTE 5L MARINE - FD C/4 UN')).toBe('925')
  })

  it('retorna a string inteira se nao houver traco', () => {
    expect(extrairSku('TQ0001')).toBe('TQ0001')
  })
})

describe('transformOrdem', () => {
  it('transforma ordem externa para formato interno', () => {
    const resultado = transformOrdem(ordemExterna)

    expect(resultado.numero_externo).toBe('31389')
    expect(resultado.produto_sku).toBe('925')
    expect(resultado.quantidade).toBe(190)
    expect(resultado.unidade).toBe('FD')
    expect(resultado.data_prevista).toBe('2026-04-06')
    expect(resultado.tanque).toBe('tq3')
    expect(resultado.lote).toBe('lt906')
    expect(resultado.etapa).toBe('envase')
    expect(resultado.status).toBe('aguardando')
  })

  it('marca etapa tanque quando sku TQ e unidade em litros', () => {
    const resultado = transformOrdem({
      ...ordemExterna,
      sku: 'TQ0001',
      unidade: 'L',
      quantidade: 3800,
    })

    expect(resultado.etapa).toBe('tanque')
  })
})
