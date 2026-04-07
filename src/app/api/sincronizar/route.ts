import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchOrdensExternas, transformOrdem } from '@/lib/sync/api-externa'

function traduzirErroSchema(mensagem: string): string {
  const lower = mensagem.toLowerCase()
  if (lower.includes('schema cache') || lower.includes('lote') || lower.includes('etapa')) {
    return 'Schema do banco desatualizado para ordens. Rode a migration 002_dashboard_producao.sql no Supabase.'
  }
  return mensagem
}

export async function POST() {
  try {
    const supabase = await createClient()
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

    return NextResponse.json({ importadas, erros })
  } catch (err) {
    console.error('Erro na sincronizacao:', err)
    return NextResponse.json({ error: traduzirErroSchema(String(err)) }, { status: 500 })
  }
}
