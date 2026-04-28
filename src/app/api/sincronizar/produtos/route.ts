import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  listarProdutosIds,
  buscarProdutoDetalhe,
  buscarProducaoFabricado,
  produtoParaUpsert,
} from '@/lib/olist/produtos'
import { OlistAuthError, OlistApiError } from '@/lib/olist/errors'

export async function POST() {
  try {
    const supabase = await createClient()
    const ids = await listarProdutosIds()

    let importados = 0
    let erros = 0
    let producaoImportada = 0

    for (const id of ids) {
      try {
        const detalhe = await buscarProdutoDetalhe(id)
        const row = produtoParaUpsert(detalhe)

        const { error } = await supabase
          .from('produtos_erp')
          .upsert(row, { onConflict: 'id_olist' })

        if (error) {
          console.error(`Erro upsert produto ${id}:`, error.message)
          erros++
          continue
        }

        importados++

        // Busca estrutura de producao para produtos fabricados (tipo F)
        if (detalhe.tipo === 'F') {
          const producao = await buscarProducaoFabricado(id)

          if (producao) {
            // Deleta estrutura e etapas antigas antes de reinserir
            await supabase.from('producao_estrutura_erp').delete().eq('produto_id_olist', id)
            await supabase.from('producao_etapas_erp').delete().eq('produto_id_olist', id)

            const sincronizadoEm = new Date().toISOString()

            if (producao.estrutura.length > 0) {
              await supabase.from('producao_estrutura_erp').insert(
                producao.estrutura.map((e) => ({
                  produto_id_olist: e.produtoIdOlist,
                  mp_id_olist: e.mpIdOlist,
                  mp_sku: e.mpSku,
                  mp_descricao: e.mpDescricao,
                  mp_tipo: e.mpTipo,
                  quantidade: e.quantidade,
                  sincronizado_em: sincronizadoEm,
                }))
              )
            }

            if (producao.etapas.length > 0) {
              await supabase.from('producao_etapas_erp').insert(
                producao.etapas.map((e) => ({
                  produto_id_olist: e.produtoIdOlist,
                  ordem: e.ordem,
                  descricao: e.descricao,
                  sincronizado_em: sincronizadoEm,
                }))
              )
            }

            producaoImportada++
          }
        }
      } catch (err) {
        console.error(`Erro ao sincronizar produto ${id}:`, err)
        erros++
      }
    }

    return NextResponse.json({
      total: ids.length,
      importados,
      producao_importada: producaoImportada,
      erros,
    })
  } catch (err) {
    if (err instanceof OlistAuthError) {
      return NextResponse.json(
        { error: 'Olist não conectado. Acesse /admin/olist para reconectar.' },
        { status: 401 }
      )
    }

    if (err instanceof OlistApiError) {
      return NextResponse.json(
        { error: `API Olist retornou ${err.status}` },
        { status: 502 }
      )
    }

    console.error('Erro na sincronizacao de produtos:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
