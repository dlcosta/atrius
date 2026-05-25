import { describe, expect, it } from 'vitest'
import { extrairCategoriasResposta, flattenCategoriasArvore, type CategoriaArvore } from '@/lib/olist/categorias'

describe('extrairCategoriasResposta', () => {
  it('aceita resposta em formato de array', () => {
    const payload = [
      {
        id: 10,
        descricao: 'Limpeza',
        filhas: [{ id: 11, descricao: 'Detergentes', filhas: [] }],
      },
    ]

    const categorias = extrairCategoriasResposta(payload)
    expect(categorias).toHaveLength(1)
    expect(categorias[0].id).toBe(10)
    expect(categorias[0].filhas[0].descricao).toBe('Detergentes')
  })

  it('aceita resposta em formato de objeto com campo categorias', () => {
    const payload = {
      categorias: [{ id: 20, descricao: 'Perfumaria', filhas: [] }],
    }

    const categorias = extrairCategoriasResposta(payload)
    expect(categorias).toHaveLength(1)
    expect(categorias[0].id).toBe(20)
  })

  it('falha com payload invalido', () => {
    expect(() => extrairCategoriasResposta({ ok: true })).toThrow(
      'Formato de resposta da API de categorias nao reconhecido.'
    )
  })
})

describe('flattenCategoriasArvore', () => {
  it('achata a arvore com caminho, nivel e parent id', () => {
    const arvore: CategoriaArvore[] = [
      {
        id: 1,
        descricao: 'Raiz',
        filhas: [
          { id: 2, descricao: 'Filha A', filhas: [] },
          {
            id: 3,
            descricao: 'Filha B',
            filhas: [{ id: 4, descricao: 'Neta', filhas: [] }],
          },
        ],
      },
    ]

    const linhas = flattenCategoriasArvore(arvore)

    expect(linhas).toHaveLength(4)
    expect(linhas[0]).toMatchObject({
      id: 1,
      categoria_pai_id: null,
      nivel: 0,
      caminho: 'Raiz',
      filhas_count: 2,
    })

    expect(linhas[1]).toMatchObject({
      id: 2,
      categoria_pai_id: 1,
      nivel: 1,
      caminho: 'Raiz > Filha A',
    })

    expect(linhas[3]).toMatchObject({
      id: 4,
      categoria_pai_id: 3,
      nivel: 2,
      caminho: 'Raiz > Filha B > Neta',
    })
  })
})
