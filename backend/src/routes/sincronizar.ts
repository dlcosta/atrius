import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'
import { fetchOrdensExternas, transformOrdem } from '../lib/sync/api-externa'
import { fetchCategoriasArvore, flattenCategoriasArvore } from '../lib/olist/categorias'
import { OlistAuthError, OlistApiError } from '../lib/olist/errors'
import {
  listarPedidos,
  pedidoParaUpsert,
  obterPedido,
  itensPedidoParaUpsert,
  type PedidoResumo,
} from '../lib/olist/pedidos'
import {
  listarProdutosResumos,
  buscarProdutoDetalhe,
  buscarProducaoFabricado,
  produtoParaUpsert,
} from '../lib/olist/produtos'
import type { SupabaseClient } from '@supabase/supabase-js'

const router = Router()

// POST /api/sincronizar
router.post('/', async (_req: Request, res: Response) => {
  function traduzirErroSchema(mensagem: string): string {
    const lower = mensagem.toLowerCase()
    if (lower.includes('sincronizar_erp_para_plataforma')) {
      return 'Schema do banco desatualizado para a ponte ERP. Rode a migration 010_erp_platform_bridge.sql no Supabase.'
    }
    if (lower.includes('status') && lower.includes('cancelada')) {
      return 'Schema do banco desatualizado para status de ordens. Rode a migration 010_erp_platform_bridge.sql no Supabase.'
    }
    if (lower.includes('schema cache') || lower.includes('lote') || lower.includes('etapa')) {
      return 'Schema do banco desatualizado para ordens. Rode a migration 002_dashboard_producao.sql no Supabase.'
    }
    return mensagem
  }

  try {
    const supabase = createClient()

    // Try ERP RPC first
    const { count, error: countError } = await supabase
      .from('pedidos_erp_itens')
      .select('*', { count: 'exact', head: true })

    if (!countError && count && count > 0) {
      const hoje = new Date()
      const inicio = new Date(hoje)
      inicio.setDate(inicio.getDate() - 30)
      const fim = new Date(hoje)
      fim.setDate(fim.getDate() + 30)

      const { data, error } = await supabase.rpc('sincronizar_erp_para_plataforma', {
        p_limite: 1000,
        p_data_inicial: inicio.toISOString().slice(0, 10),
        p_data_final: fim.toISOString().slice(0, 10),
        p_incluir_sem_data: false,
      })

      if (error) throw new Error(error.message)

      const resultado = Array.isArray(data) ? data[0] : data
      return res.json({
        origem: 'erp_sql',
        importadas: Number(resultado?.ordens_importadas ?? 0),
        atualizadas: Number(resultado?.ordens_atualizadas ?? 0),
        produtos_importados: Number(resultado?.produtos_importados ?? 0),
        ignoradas: Number(resultado?.ordens_ignoradas ?? 0),
        erros: 0,
      })
    }

    // Fall back to external API
    const ordensExternas = await fetchOrdensExternas()
    const { data: maquinas } = await supabase.from('maquinas').select('id, nome')
    if (!maquinas) throw new Error('Falha ao carregar máquinas')

    const maquinaMap: Record<string, string> = {}
    maquinas.forEach((m) => {
      const codigo = m.nome.toLowerCase().replace(/\s+/g, '')
      maquinaMap[codigo] = m.id
    })

    let importadas = 0
    let erros = 0

    for (const ordemExt of ordensExternas) {
      const transformed = transformOrdem(ordemExt)

      const { data: existente } = await supabase
        .from('ordens')
        .select('id, inicio_agendado')
        .eq('numero_externo', transformed.numero_externo)
        .single()

      const maquinaId = transformed.maquina_externa_codigo
        ? maquinaMap[transformed.maquina_externa_codigo] ?? null
        : null

      if (existente?.inicio_agendado) {
        const { error } = await supabase.from('ordens').update({
          quantidade: transformed.quantidade,
          unidade: transformed.unidade,
          data_prevista: transformed.data_prevista,
          tanque: transformed.tanque,
          lote: transformed.lote,
          etapa: transformed.etapa,
          sincronizado_em: transformed.sincronizado_em,
        }).eq('id', existente.id)

        if (error) erros++
        else importadas++
        continue
      }

      const { error } = await supabase.from('ordens').upsert({
        numero_externo: transformed.numero_externo,
        produto_sku: transformed.produto_sku,
        maquina_id: maquinaId,
        quantidade: transformed.quantidade,
        unidade: transformed.unidade,
        data_prevista: transformed.data_prevista,
        tanque: transformed.tanque,
        lote: transformed.lote,
        etapa: transformed.etapa,
        status: transformed.status,
        sincronizado_em: transformed.sincronizado_em,
      }, { onConflict: 'numero_externo' })

      if (error) erros++
      else importadas++
    }

    return res.json({ origem: 'api_externa', importadas, erros })
  } catch (err) {
    return res.status(500).json({ error: traduzirErroSchema(String(err)) })
  }
})

// POST /api/sincronizar/categorias
router.post('/categorias', async (_req: Request, res: Response) => {
  try {
    const supabase = createClient()
    const categorias = await fetchCategoriasArvore()
    const categoriasUpsert = flattenCategoriasArvore(categorias)

    const { error } = await supabase.from('categorias_erp').upsert(categoriasUpsert, { onConflict: 'id' })
    if (error) throw new Error(error.message)

    return res.json({ categorias_raiz: categorias.length, importadas: categoriasUpsert.length })
  } catch (err) {
    if (err instanceof OlistAuthError) {
      return res.status(401).json({ error: 'Olist não conectado. Acesse /admin/olist para reconectar.' })
    }
    if (err instanceof OlistApiError) {
      const details = err.status === 403
        ? 'Verificando permissões. A API pode exigir escopo diferente ou o endpoint pode não estar disponível nessa versão.'
        : err.message
      return res.status(502).json({ error: `API Olist retornou ${err.status}`, details })
    }
    return res.status(500).json({ error: String(err) })
  }
})

// POST /api/sincronizar/pedidos
router.post('/pedidos', async (req: Request, res: Response) => {
  function parsePositiveInt(value: unknown, fallback: number): number {
    if (!value) return fallback
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return Math.floor(n)
  }

  function formatDateYmd(date: Date): string {
    return date.toISOString().slice(0, 10)
  }

  try {
    const supabase = createClient()
    const mode = req.query.mode === 'full' ? 'full' : 'incremental'
    const numeroPedido = parsePositiveInt(req.query.numero, 0)
    const limit = Math.min(parsePositiveInt(req.query.limit, 100), 100)
    const pages = parsePositiveInt(req.query.pages, mode === 'full' ? 100000 : 40)

    if (numeroPedido > 0) {
      const page = await listarPedidos({ numero: numeroPedido, limit: 1, offset: 0 })
      if (page.itens.length === 0) {
        return res.json({ mode: 'pedido', numero_pedido: numeroPedido, importados: 0, erros: 0, encontrado: false })
      }
      const rows = page.itens.map(pedidoParaUpsert)
      const { error } = await supabase.from('pedidos_erp').upsert(rows, { onConflict: 'id_olist' })
      if (error) throw new Error(`Erro upsert pedido ${numeroPedido}: ${error.message}`)
      return res.json({ mode: 'pedido', numero_pedido: numeroPedido, importados: rows.length, erros: 0, encontrado: true })
    }

    let checkpointAnterior: string | null = null
    const pedidosExistentes = mode === 'incremental'
      ? await (async () => {
          const ids = new Set<number>()
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase.from('pedidos_erp').select('id_olist').range(from, from + 999)
            if (error) throw error
            data?.forEach((pedido) => ids.add(Number(pedido.id_olist)))
            if (!data || data.length < 1000) break
          }
          return ids
        })()
      : new Set<number>()

    if (mode === 'incremental') {
      const { data } = await supabase.from('sincronizacao_erp_controle').select('valor_texto').eq('chave', 'pedidos_data_atualizacao').limit(1)
      checkpointAnterior = data?.[0]?.valor_texto ?? null
    }

    let total = 0
    let importados = 0
    let pulados = 0
    let erros = 0
    let pagesProcessadas = 0

    for (let i = 0; i < pages; i++) {
      const offset = i * limit
      const page = await listarPedidos({
        limit,
        offset,
        orderBy: 'desc',
        dataAtualizacao: mode === 'incremental' ? checkpointAnterior ?? undefined : undefined,
      })

      if (i === 0) total = page.paginacao.total
      if (page.itens.length === 0) break

      const pedidosParaImportar = mode === 'incremental' && !checkpointAnterior
        ? page.itens.filter((pedido) => {
            if (pedidosExistentes.has(pedido.id)) { pulados++; return false }
            return true
          })
        : page.itens

      if (pedidosParaImportar.length > 0) {
        const rows = pedidosParaImportar.map(pedidoParaUpsert)
        const { error } = await supabase.from('pedidos_erp').upsert(rows, { onConflict: 'id_olist' })
        if (error) erros += rows.length
        else importados += rows.length
      }

      pagesProcessadas++
      if (offset + limit >= page.paginacao.total) break
    }

    if (mode === 'incremental') {
      const checkpointNovo = formatDateYmd(new Date(Date.now() - 24 * 60 * 60 * 1000))
      await supabase.from('sincronizacao_erp_controle').upsert(
        { chave: 'pedidos_data_atualizacao', valor_texto: checkpointNovo, atualizado_em: new Date().toISOString() },
        { onConflict: 'chave' }
      )
      return res.json({ mode, checkpoint_anterior: checkpointAnterior, checkpoint_novo: checkpointNovo, total_api: total, pages_processadas: pagesProcessadas, importados, pulados, erros })
    }

    return res.json({ mode, total_api: total, pages_processadas: pagesProcessadas, importados, pulados, erros })
  } catch (err) {
    if (err instanceof OlistAuthError) return res.status(401).json({ error: 'Olist não conectado.' })
    if (err instanceof OlistApiError) return res.status(502).json({ error: `API Olist retornou ${err.status}` })
    return res.status(500).json({ error: String(err) })
  }
})

// POST /api/sincronizar/pedidos/itens
router.post('/pedidos/itens', async (req: Request, res: Response) => {
  function parsePositiveInt(value: unknown, fallback: number): number {
    if (!value) return fallback
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return Math.floor(n)
  }

  function formatDateYmd(date: Date): string {
    return date.toISOString().slice(0, 10)
  }

  async function processPedido(supabase: SupabaseClient, pedidoResumo: PedidoResumo) {
    function isRateLimitError(error: unknown): boolean {
      return String(error ?? '').includes('429')
    }
    function delay(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    try {
      const pedidoRow = pedidoParaUpsert(pedidoResumo)
      const { error: pedidoError } = await supabase.from('pedidos_erp').upsert(pedidoRow, { onConflict: 'id_olist' })
      if (pedidoError) return { ok: false, itens: 0, error: `Erro upsert pedido ${pedidoResumo.id}: ${pedidoError.message}` }

      let detalhe = null
      let lastError: unknown = null
      for (let tentativa = 1; tentativa <= 4; tentativa++) {
        try {
          detalhe = await obterPedido(pedidoResumo.id)
          break
        } catch (error) {
          lastError = error
          if (!isRateLimitError(error) || tentativa === 4) break
          await delay(800 * tentativa)
        }
      }
      if (!detalhe) return { ok: false, itens: 0, error: `Erro detalhe pedido ${pedidoResumo.id}: ${String(lastError)}` }

      const itens = itensPedidoParaUpsert(detalhe)
      await supabase.from('pedidos_erp_itens').delete().eq('pedido_id_olist', detalhe.id)

      if (itens.length > 0) {
        const { error: insError } = await supabase.from('pedidos_erp_itens').insert(itens)
        if (insError) return { ok: false, itens: 0, error: `Erro inserindo itens do pedido ${detalhe.id}: ${insError.message}` }
      }

      return { ok: true, itens: itens.length }
    } catch (error) {
      return { ok: false, itens: 0, error: String(error) }
    }
  }

  try {
    const supabase = createClient()
    const full = req.query.full === '1'
    const limit = Math.min(parsePositiveInt(req.query.limit, 100), 100)
    const pages = parsePositiveInt(req.query.pages, full ? 5 : 3)
    const concurrency = Math.min(parsePositiveInt(req.query.concurrency, 1), 12)

    const CHECKPOINT_DATE_KEY = 'pedidos_itens_data_atualizacao'
    const CHECKPOINT_FULL_OFFSET_KEY = 'pedidos_itens_full_offset'

    let offsetInicial = 0
    let checkpointAnterior: string | null = null
    let pedidosComItensExistentes = new Set<number>()

    if (full) {
      const { data } = await supabase.from('sincronizacao_erp_controle').select('valor_texto').eq('chave', CHECKPOINT_FULL_OFFSET_KEY).limit(1)
      offsetInicial = Math.max(0, Number(data?.[0]?.valor_texto ?? 0))
    } else {
      const { data } = await supabase.from('sincronizacao_erp_controle').select('valor_texto').eq('chave', CHECKPOINT_DATE_KEY).limit(1)
      checkpointAnterior = data?.[0]?.valor_texto ?? null
      if (!checkpointAnterior) {
        for (let from = 0; ; from += 1000) {
          const { data: items, error } = await supabase.from('pedidos_erp_itens').select('pedido_id_olist').range(from, from + 999)
          if (error) throw error
          items?.forEach((item) => pedidosComItensExistentes.add(Number(item.pedido_id_olist)))
          if (!items || items.length < 1000) break
        }
      }
    }

    let totalPedidosEncontrados = 0
    let pedidosProcessados = 0
    let itensImportados = 0
    let erros = 0
    let pulados = 0
    let pagesProcessadas = 0
    let offsetAtual = offsetInicial

    for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
      const page = await listarPedidos({
        limit,
        offset: offsetAtual,
        orderBy: 'desc',
        dataAtualizacao: full ? undefined : checkpointAnterior ?? undefined,
      })

      if (pageIndex === 0) totalPedidosEncontrados = page.paginacao.total
      if (page.itens.length === 0) break

      const pedidosParaProcessar = !full && !checkpointAnterior
        ? page.itens.filter((pedido) => {
            if (pedidosComItensExistentes.has(pedido.id)) { pulados++; return false }
            return true
          })
        : page.itens

      let index = 0
      let processed = 0
      let importedItens = 0
      let localErros = 0

      async function worker() {
        while (true) {
          const current = index++
          if (current >= pedidosParaProcessar.length) break
          const result = await processPedido(supabase, pedidosParaProcessar[current])
          if (result.ok) { processed++; importedItens += result.itens }
          else localErros++
        }
      }

      await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()))
      pedidosProcessados += processed
      itensImportados += importedItens
      erros += localErros
      pagesProcessadas++
      offsetAtual += limit
      if (offsetAtual >= page.paginacao.total) break
    }

    const formatDateYmd2 = (date: Date) => date.toISOString().slice(0, 10)

    if (full) {
      const finalizado = offsetAtual >= (totalPedidosEncontrados || 0)
      await supabase.from('sincronizacao_erp_controle').upsert(
        { chave: CHECKPOINT_FULL_OFFSET_KEY, valor_texto: String(finalizado ? 0 : offsetAtual), atualizado_em: new Date().toISOString() },
        { onConflict: 'chave' }
      )
      return res.json({ modo: 'full', total_pedidos_encontrados: totalPedidosEncontrados, offset_inicial: offsetInicial, offset_proximo: finalizado ? 0 : offsetAtual, finalizado, pages_processadas: pagesProcessadas, pedidos_processados: pedidosProcessados, itens_importados: itensImportados, erros })
    }

    const checkpointNovo = formatDateYmd2(new Date(Date.now() - 24 * 60 * 60 * 1000))
    await supabase.from('sincronizacao_erp_controle').upsert(
      { chave: CHECKPOINT_DATE_KEY, valor_texto: checkpointNovo, atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' }
    )

    return res.json({ modo: 'incremental', checkpoint_anterior: checkpointAnterior, checkpoint_novo: checkpointNovo, total_pedidos_encontrados: totalPedidosEncontrados, pages_processadas: pagesProcessadas, pedidos_processados: pedidosProcessados, itens_importados: itensImportados, pulados, erros })
  } catch (err) {
    if (err instanceof OlistAuthError) return res.status(401).json({ error: 'Olist não conectado.' })
    if (err instanceof OlistApiError) return res.status(502).json({ error: `API Olist retornou ${err.status}` })
    return res.status(500).json({ error: String(err) })
  }
})

// POST /api/sincronizar/produtos
router.post('/produtos', async (req: Request, res: Response) => {
  try {
    const supabase = createClient()
    const full = req.query.full === '1'
    const CHECKPOINT_KEY = 'produtos_full_sincronizado_em'
    const inicio = Date.now()

    let checkpointAnterior: string | null = null

    if (!full) {
      const { data } = await supabase.from('sincronizacao_erp_controle').select('valor_texto').eq('chave', CHECKPOINT_KEY).limit(1)
      checkpointAnterior = data?.[0]?.valor_texto ?? null
    }

    const produtos = await listarProdutosResumos()

    let importados = 0
    let erros = 0
    let producaoImportada = 0
    let pulados = 0

    const agora = new Date()
    const checkpointAnteriorDate = checkpointAnterior ? new Date(checkpointAnterior) : null
    const produtosExistentes = new Set<number>()

    if (!full) {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('produtos_erp').select('id_olist').range(from, from + 999)
        if (error) throw error
        data?.forEach((produto) => produtosExistentes.add(Number(produto.id_olist)))
        if (!data || data.length < 1000) break
      }
    }

    for (const produto of produtos) {
      const id = produto.id
      try {
        if (!full && produtosExistentes.has(id)) {
          const resumoAtualizadoEm = produto.dataAlteracao ? new Date(produto.dataAlteracao) : null
          if (!resumoAtualizadoEm || !checkpointAnteriorDate || resumoAtualizadoEm <= checkpointAnteriorDate) {
            pulados++
            continue
          }
        }

        const detalhe = await buscarProdutoDetalhe(id)
        const row = produtoParaUpsert(detalhe)

        if (!full && checkpointAnteriorDate) {
          const produtoAtualizadoEm = detalhe.dataAlteracao ? new Date(detalhe.dataAlteracao) : null
          if (produtoAtualizadoEm && produtoAtualizadoEm <= checkpointAnteriorDate) { pulados++; continue }
        }

        const { error } = await supabase.from('produtos_erp').upsert(row, { onConflict: 'id_olist' })
        if (error) { erros++; continue }
        importados++

        if (detalhe.tipo === 'F') {
          const producao = await buscarProducaoFabricado(id)
          if (producao) {
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
        erros++
      }
    }

    const novoCheckpoint = agora.toISOString()
    await supabase.from('sincronizacao_erp_controle').upsert(
      { chave: CHECKPOINT_KEY, valor_texto: novoCheckpoint, atualizado_em: novoCheckpoint },
      { onConflict: 'chave' }
    )

    return res.json({
      modo: full ? 'full' : 'incremental',
      checkpoint_anterior: checkpointAnterior,
      checkpoint_novo: novoCheckpoint,
      total: produtos.length,
      importados,
      pulados,
      producao_importada: producaoImportada,
      erros,
    })
  } catch (err) {
    if (err instanceof OlistAuthError) return res.status(401).json({ error: 'Olist não conectado.' })
    if (err instanceof OlistApiError) return res.status(502).json({ error: `API Olist retornou ${err.status}` })
    return res.status(500).json({ error: String(err) })
  }
})

export default router
