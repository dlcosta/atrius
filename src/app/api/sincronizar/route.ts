import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchOrdensExternas, transformOrdem } from '@/lib/sync/api-externa'

type ResultadoSyncErp = {
  produtos_importados: number
  ordens_importadas: number
  ordens_atualizadas: number
  ordens_ignoradas: number
}

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

async function sincronizarErpParaPlataforma(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ResultadoSyncErp | null> {
  const { count, error: countError } = await supabase
    .from('pedidos_erp_itens')
    .select('*', { count: 'exact', head: true })

  if (countError) {
    if (countError.message.toLowerCase().includes('does not exist')) return null
    throw new Error(`Erro ao contar itens ERP: ${countError.message}`)
  }

  if (!count || count <= 0) return null

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
  return {
    produtos_importados: Number(resultado?.produtos_importados ?? 0),
    ordens_importadas: Number(resultado?.ordens_importadas ?? 0),
    ordens_atualizadas: Number(resultado?.ordens_atualizadas ?? 0),
    ordens_ignoradas: Number(resultado?.ordens_ignoradas ?? 0),
  }
}

async function sincronizarApiExterna(supabase: Awaited<ReturnType<typeof createClient>>) {
  const ordensExternas = await fetchOrdensExternas()

  const { data: maquinas } = await supabase.from('maquinas').select('id, nome')
  if (!maquinas) throw new Error('Falha ao carregar maquinas')

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
      const { error } = await supabase
        .from('ordens')
        .update({
          quantidade: transformed.quantidade,
          unidade: transformed.unidade,
          data_prevista: transformed.data_prevista,
          tanque: transformed.tanque,
          lote: transformed.lote,
          etapa: transformed.etapa,
          sincronizado_em: transformed.sincronizado_em,
        })
        .eq('id', existente.id)

      if (error) {
        console.error('Erro atualizando ordem sincronizada:', error.message)
        erros++
      } else {
        importadas++
      }
      continue
    }

    const { error } = await supabase.from('ordens').upsert(
      {
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
      },
      { onConflict: 'numero_externo' }
    )

    if (error) {
      console.error('Erro upsert sincronizacao:', error.message)
      erros++
      continue
    }

    importadas++
  }

  return { importadas, erros }
}

export async function POST() {
  try {
    const supabase = await createClient()

    const resultadoErp = await sincronizarErpParaPlataforma(supabase)
    if (resultadoErp) {
      return NextResponse.json({
        origem: 'erp_sql',
        importadas: resultadoErp.ordens_importadas,
        atualizadas: resultadoErp.ordens_atualizadas,
        produtos_importados: resultadoErp.produtos_importados,
        ignoradas: resultadoErp.ordens_ignoradas,
        erros: 0,
      })
    }

    const { importadas, erros } = await sincronizarApiExterna(supabase)
    return NextResponse.json({ origem: 'api_externa', importadas, erros })
  } catch (err) {
    console.error('Erro na sincronizacao:', err)
    return NextResponse.json({ error: traduzirErroSchema(String(err)) }, { status: 500 })
  }
}
