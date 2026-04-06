import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchOrdensExternas, transformOrdem } from '@/lib/sync/api-externa'

export async function POST() {
  try {
    const supabase = await createClient()
    const ordensExternas = await fetchOrdensExternas()

    const { data: maquinas } = await supabase.from('maquinas').select('id, nome')
    if (!maquinas) throw new Error('Falha ao carregar máquinas')

    // Mapa: "mq1" → uuid, "mq2" → uuid, etc.
    const maquinaMap: Record<string, string> = {}
    maquinas.forEach((m) => {
      const codigo = m.nome.toLowerCase().replace(/\s+/g, '')  // "MAQ 1" → "maq1"
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

      if (existente?.inicio_agendado) {
        await supabase
          .from('ordens')
          .update({ sincronizado_em: transformed.sincronizado_em })
          .eq('id', existente.id)
        continue
      }

      const maquinaId = transformed.maquina_externa_codigo
        ? maquinaMap[transformed.maquina_externa_codigo] ?? null
        : null

      const { error } = await supabase.from('ordens').upsert(
        {
          numero_externo: transformed.numero_externo,
          produto_sku: transformed.produto_sku,
          maquina_id: maquinaId,
          quantidade: transformed.quantidade,
          unidade: transformed.unidade,
          data_prevista: transformed.data_prevista,
          status: transformed.status,
          sincronizado_em: transformed.sincronizado_em,
        },
        { onConflict: 'numero_externo' }
      )

      if (error) { erros++; continue }
      importadas++
    }

    return NextResponse.json({ importadas, erros })
  } catch (err) {
    console.error('Erro na sincronização:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
