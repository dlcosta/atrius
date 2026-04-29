import { describe, it, expect, vi } from 'vitest'
import {
  parseCategoriaNode,
  extrairCategoriasResposta,
  flattenCategoriasArvore,
} from '@/lib/olist/categorias'

describe('parseCategoriaNode', () => {
  it('parseia nó válido com filhas', () => {
    const resultado = parseCategoriaNode({
      id: 1,
      descricao: 'Roupas',
      filhas: [{ id: 2, descricao: 'Camisetas', filhas: [] }],
    })
    expect(resultado).toEqual({
      id: 1,
      descricao: 'Roupas',
      filhas: [{ id: 2, descricao: 'Camisetas', filhas: [] }],
    })
  })

  it('lança erro quando id está ausente', () => {
    expect(() => parseCategoriaNode({ descricao: 'Sem ID', filhas: [] }))
      .toThrow('campo id ausente ou invalido')
  })

  it('lança erro quando descricao está ausente', () => {
    expect(() => parseCategoriaNode({ id: 1, filhas: [] }))
      .toThrow('descricao ausente')
  })

  it('lança erro quando input não é objeto', () => {
    expect(() => parseCategoriaNode('string')).toThrow('item nao e objeto')
  })
})

describe('extrairCategoriasResposta', () => {
  it('aceita array direto', () => {
    const resultado = extrairCategoriasResposta([{ id: 1, descricao: 'A', filhas: [] }])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].id).toBe(1)
  })

  it('aceita wrapper com chave "categorias"', () => {
    const resultado = extrairCategoriasResposta({
      categorias: [{ id: 2, descricao: 'B', filhas: [] }],
    })
    expect(resultado[0].id).toBe(2)
  })

  it('aceita objeto único com id e descricao', () => {
    const resultado = extrairCategoriasResposta({ id: 3, descricao: 'C', filhas: [] })
    expect(resultado).toHaveLength(1)
    expect(resultado[0].id).toBe(3)
  })

  it('lança erro para formato desconhecido', () => {
    expect(() => extrairCategoriasResposta({ foo: 'bar' }))
      .toThrow('Formato de resposta da API de categorias nao reconhecido')
  })
})

describe('flattenCategoriasArvore', () => {
  it('planifica árvore de 3 níveis com caminho e nivel corretos', () => {
    const arvore = [{
      id: 1, descricao: 'Raiz', filhas: [{
        id: 2, descricao: 'Filho', filhas: [{
          id: 3, descricao: 'Neto', filhas: [],
        }],
      }],
    }]

    const resultado = flattenCategoriasArvore(arvore)

    expect(resultado).toHaveLength(3)
    expect(resultado[0]).toMatchObject({ id: 1, nivel: 0, caminho: 'Raiz', categoria_pai_id: null, filhas_count: 1 })
    expect(resultado[1]).toMatchObject({ id: 2, nivel: 1, caminho: 'Raiz > Filho', categoria_pai_id: 1, filhas_count: 1 })
    expect(resultado[2]).toMatchObject({ id: 3, nivel: 2, caminho: 'Raiz > Filho > Neto', categoria_pai_id: 2, filhas_count: 0 })
  })
})
