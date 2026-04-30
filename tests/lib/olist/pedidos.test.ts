import { describe, it, expect } from 'vitest'
import {
  buildPedidosQuery,
  itensPedidoParaUpsert,
  pedidoParaUpsert,
  PEDIDO_SITUACOES,
} from '@/lib/olist/pedidos'

describe('buildPedidosQuery', () => {
  it('aplica defaults de paginacao', () => {
    const params = buildPedidosQuery()

    expect(params.get('limit')).toBe('100')
    expect(params.get('offset')).toBe('0')
  })

  it('aplica filtros suportados e marcadores repetidos', () => {
    const params = buildPedidosQuery({
      numero: 123,
      nomeCliente: 'Cliente A',
      codigoCliente: 'C01',
      cpfCnpj: '123',
      dataInicial: '2026-01-01',
      dataFinal: '2026-01-31',
      dataAtualizacao: '2026-01-31',
      situacao: 3,
      numeroPedidoEcommerce: 'EC-77',
      idVendedor: 99,
      marcadores: ['urgente', ' atacado '],
      origemPedido: 1,
      orderBy: 'asc',
      limit: 20,
      offset: 10,
    })

    expect(params.get('numero')).toBe('123')
    expect(params.get('nomeCliente')).toBe('Cliente A')
    expect(params.get('codigoCliente')).toBe('C01')
    expect(params.get('cpfCnpj')).toBe('123')
    expect(params.get('dataInicial')).toBe('2026-01-01')
    expect(params.get('dataFinal')).toBe('2026-01-31')
    expect(params.get('dataAtualizacao')).toBe('2026-01-31')
    expect(params.get('situacao')).toBe('3')
    expect(params.get('numeroPedidoEcommerce')).toBe('EC-77')
    expect(params.get('idVendedor')).toBe('99')
    expect(params.getAll('marcadores')).toEqual(['urgente', 'atacado'])
    expect(params.get('origemPedido')).toBe('1')
    expect(params.get('orderBy')).toBe('asc')
    expect(params.get('limit')).toBe('20')
    expect(params.get('offset')).toBe('10')
  })

  it('ignora situacao invalida e limita valores de paginacao', () => {
    const invalida = 999 as (typeof PEDIDO_SITUACOES)[number]
    const params = buildPedidosQuery({ situacao: invalida, limit: 1000, offset: -5 })

    expect(params.get('situacao')).toBeNull()
    expect(params.get('limit')).toBe('100')
    expect(params.get('offset')).toBe('0')
  })
})

describe('pedidoParaUpsert', () => {
  it('mapeia campos principais para o formato de banco', () => {
    const row = pedidoParaUpsert({
      id: 10,
      situacao: 3,
      numeroPedido: 2001,
      dataCriacao: '2026-01-01T10:00:00.000Z',
      dataPrevista: '2026-01-05T10:00:00.000Z',
      cliente: { id: 7, nome: 'Cliente X', codigo: 'CX', cpfCnpj: '123456' },
      valor: 150.9,
      origemPedido: 0,
      ecommerce: { id: 2, nome: 'Marketplace', numeroPedidoEcommerce: 'MKT-99' },
    })

    expect(row).toMatchObject({
      id_olist: 10,
      situacao: 3,
      numero_pedido: 2001,
      data_criacao: '2026-01-01T10:00:00.000Z',
      data_prevista: '2026-01-05T10:00:00.000Z',
      cliente_id: 7,
      cliente_nome: 'Cliente X',
      cliente_codigo: 'CX',
      cliente_cpf_cnpj: '123456',
      valor: 150.9,
      origem_pedido: 0,
      ecommerce_id: 2,
      ecommerce_nome: 'Marketplace',
      ecommerce_numero_pedido: 'MKT-99',
    })
    expect(typeof row.sincronizado_em).toBe('string')
  })
})

describe('itensPedidoParaUpsert', () => {
  it('gera sequencia e campos dos itens para insert', () => {
    const rows = itensPedidoParaUpsert({
      id: 100,
      numeroPedido: 9001,
      itens: [
        {
          produto: { id: 1, sku: 'SKU-1', descricao: 'Produto 1', tipo: 'P' },
          quantidade: 2,
          valorUnitario: 10.5,
          infoAdicional: 'Obs 1',
        },
        {
          produto: { id: 2, sku: 'SKU-2', descricao: 'Produto 2', tipo: 'P' },
          quantidade: 1,
          valorUnitario: 5,
          infoAdicional: null,
        },
      ],
    })

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      pedido_id_olist: 100,
      item_sequencia: 1,
      produto_id_olist: 1,
      produto_sku: 'SKU-1',
      produto_descricao: 'Produto 1',
      produto_tipo: 'P',
      quantidade: 2,
      valor_unitario: 10.5,
      info_adicional: 'Obs 1',
    })
    expect(rows[1]).toMatchObject({
      pedido_id_olist: 100,
      item_sequencia: 2,
      produto_id_olist: 2,
      produto_sku: 'SKU-2',
      produto_descricao: 'Produto 2',
      produto_tipo: 'P',
      quantidade: 1,
      valor_unitario: 5,
      info_adicional: null,
    })
  })
})
