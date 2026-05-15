import { NextResponse, NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  listarProdutosResumos,
  buscarProdutoDetalhe,
  buscarProducaoFabricado,
  produtoParaUpsert,
} from '@/lib/olist/produtos'
import { OlistAuthError, OlistApiError } from '@/lib/olist/errors'

const CHECKPOINT_KEY = 'produtos_full_sincronizado_em'

async function carregarProdutosExistentes(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const ids = new Set<number>()
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('produtos_erp')
      .select('id_olist')
      .range(from, from + pageSize - 1)

    if (error) {
      throw error
    }

    data?.forEach((produto) => ids.add(Number(produto.id_olist)))

    if (!data || data.length < pageSize) {
      break
    }
  }

  return ids
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const search = request.nextUrl.searchParams
    const full = search.get('full') === '1'

    console.log('[PRODUTOS] Iniciando sincronização (full=' + full + ')')
    const inicio = Date.now()

    // Se não for full, usar checkpoint para evitar reprocessar tudo
    let checkpointAnterior: string | null = null
    let listarTodos = full

    if (!full) {
      const { data, error } = await supabase
        .from('sincronizacao_erp_controle')
        .select('valor_texto')
        .eq('chave', CHECKPOINT_KEY)
        .limit(1)

      if (!error && data?.[0]?.valor_texto) {
        checkpointAnterior = data[0].valor_texto
        listarTodos = false
        console.log('[PRODUTOS] Modo incremental - checkpoint anterior:', checkpointAnterior)
      } else {
        // Se não houver checkpoint, usar modo incremental (sem data base)
        listarTodos = false
        console.log('[PRODUTOS] Primeira sincronização - modo incremental')
      }
    }

    console.log('[PRODUTOS] Listando produtos...')
    const produtos = await listarProdutosResumos()
    console.log('[PRODUTOS] Total de produtos encontrados:', produtos.length)

    let importados = 0
    let erros = 0
    let producaoImportada = 0
    let pulados = 0

    const agora = new Date()
    const checkpointAnteriorDate = checkpointAnterior ? new Date(checkpointAnterior) : null
    const produtosExistentes = new Set<number>()

    if (!listarTodos) {
      const existentes = await carregarProdutosExistentes(supabase)
      existentes.forEach((id) => produtosExistentes.add(id))
    }

    for (let idx = 0; idx < produtos.length; idx++) {
      const produto = produtos[idx]
      const id = produto.id
      try {
        if (idx % 50 === 0) {
          console.log(`[PRODUTOS] Progresso: ${idx}/${produtos.length}`)
        }

        if (!listarTodos && produtosExistentes.has(id)) {
          const resumoAtualizadoEm = produto.dataAlteracao ? new Date(produto.dataAlteracao) : null
          if (!resumoAtualizadoEm || !checkpointAnteriorDate || resumoAtualizadoEm <= checkpointAnteriorDate) {
            pulados++
            continue
          }
        }

        const detalhe = await buscarProdutoDetalhe(id)
        const row = produtoParaUpsert(detalhe)

        // Se não for full, verificar se produto foi atualizado após checkpoint
        if (!listarTodos && checkpointAnteriorDate) {
          const produtoAtualizadoEm = detalhe.dataAlteracao ? new Date(detalhe.dataAlteracao) : null
          if (produtoAtualizadoEm && produtoAtualizadoEm <= checkpointAnteriorDate) {
            pulados++
            continue
          }
        }

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

    // Atualizar checkpoint
    const novoCheckpoint = agora.toISOString()
    const { error: checkpointError } = await supabase
      .from('sincronizacao_erp_controle')
      .upsert(
        {
          chave: CHECKPOINT_KEY,
          valor_texto: novoCheckpoint,
          atualizado_em: novoCheckpoint,
        },
        { onConflict: 'chave' }
      )

    if (checkpointError) {
      console.error('Erro ao atualizar checkpoint de produtos:', checkpointError.message)
    }

    const duracao = ((Date.now() - inicio) / 1000).toFixed(1)
    console.log(`[PRODUTOS] Sincronização concluída em ${duracao}s - ${importados} importados, ${pulados} pulados, ${erros} erros`)

    return NextResponse.json({
      modo: listarTodos ? 'full' : 'incremental',
      checkpoint_anterior: checkpointAnterior,
      checkpoint_novo: novoCheckpoint,
      total: produtos.length,
      importados,
      pulados,
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
