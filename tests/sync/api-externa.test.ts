import { describe, it, expect } from 'vitest'
import { extrairMaquinaId, extrairSku, transformOrdem } from '@/lib/sync/api-externa'

// Formato de exemplo da API externa baseado nos screenshots
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
  it('extrai o marcador de máquina dos marcadores', () => {
    expect(extrairMaquinaId(['lt906', 'tq3', 'mq2'])).toBe('mq2')
  })

  it('retorna null se não houver marcador de máquina', () => {
    expect(extrairMaquinaId(['lt906', 'tq3'])).toBeNull()
  })

  it('retorna o primeiro marcador de máquina encontrado', () => {
    expect(extrairMaquinaId(['mq1', 'mq2'])).toBe('mq1')
  })
})

describe('extrairSku', () => {
  it('extrai o código antes do traço', () => {
    expect(extrairSku('925 - DESINFETANTE 5L MARINE - FD C/4 UN')).toBe('925')
  })

  it('retorna a string inteira se não houver traço', () => {
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
    expect(resultado.status).toBe('aguardando')
  })
})
