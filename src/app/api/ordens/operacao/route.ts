import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularDuracao, calcularFim } from '@/lib/planning/engine'
import { mapearVolumeReferenciaPorOrdem, obterVolumeReferenciaLitros } from '@/lib/ordens/volume'
import type { EtapaOrdem } from '@/types'

type AcaoOperacao = 'iniciar' | 'finalizar'

type OrdemVolumeLinha = {
  id: string
  quantidade: number
  unidade: string | null
  lote: string | null
  etapa: EtapaOrdem | null
}

type OrdemOperacao = {
  id: string
  maquina_id: string | null
  status: string
  inicio_operacao_em: string | null
  inicio_agendado: string | null
  fim_calculado: string | null
  quantidade: number
  unidade: string | null
  lote: string | null
  etapa: EtapaOrdem | null
  produto_sku: string | null
  produto: { volume_base: number; tempos_maquinas: Record<string, { setup?: number; producao?: number }> } | null
}

function validarAcao(valor: unknown): valor is AcaoOperacao {
  return valor === 'iniciar' || valor === 'finalizar'
}

function minutosEntre(inicioIso: string | null, fimIso: string | null): number | null {
  if (!inicioIso || !fimIso) return null
  const inicioMs = new Date(inicioIso).getTime()
  const fimMs = new Date(fimIso).getTime()
  if (!Number.isFinite(inicioMs) || !Number.isFinite(fimMs)) return null
  const diff = (fimMs - inicioMs) / 60000
  return diff > 0 ? diff : null
}

async function calcularDuracaoPlanejadaMin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ordem: OrdemOperacao
): Promise<number> {
  const duracaoDaAgenda = minutosEntre(ordem.inicio_agendado, ordem.fim_calculado)
  if (duracaoDaAgenda) return duracaoDaAgenda

  if (!ordem.maquina_id || !ordem.produto) return 1

  let volumeReferencia = Number(ordem.quantidade || 0)

  if (ordem.lote) {
    const { data: ordensLote } = await supabase
      .from('ordens')
      .select('id, quantidade, unidade, lote, etapa')
      .eq('lote', ordem.lote)

    if (Array.isArray(ordensLote) && ordensLote.length > 0) {
      const map = mapearVolumeReferenciaPorOrdem(ordensLote as OrdemVolumeLinha[])
      volumeReferencia = obterVolumeReferenciaLitros(
        {
          id: ordem.id,
          quantidade: Number(ordem.quantidade || 0),
          unidade: ordem.unidade,
          lote: ordem.lote,
          etapa: ordem.etapa,
        },
        map
      )
    }
  }

  const tempos = ordem.produto.tempos_maquinas?.[ordem.maquina_id] || {}
  const setup = Number(tempos.setup ?? 0)
  const producao = Number(tempos.producao ?? 0)

  const calculado = calcularDuracao(volumeReferencia, Number(ordem.produto.volume_base || 3800), setup, producao)
  return calculado > 0 ? calculado : 1
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const ordemId = body.ordem_id as string | undefined
  const acao = body.acao as unknown

  if (!ordemId) {
    return NextResponse.json({ error: 'ordem_id obrigatorio' }, { status: 422 })
  }
  if (!validarAcao(acao)) {
    return NextResponse.json({ error: 'acao invalida' }, { status: 422 })
  }

  const { data: ordemRaw, error: erroOrdem } = await supabase
    .from('ordens')
    .select(
      'id, maquina_id, status, inicio_operacao_em, inicio_agendado, fim_calculado, quantidade, unidade, lote, etapa, produto_sku, produto:produtos(volume_base, tempos_maquinas)'
    )
    .eq('id', ordemId)
    .single()

  const ordem = ordemRaw
    ? ({
        ...ordemRaw,
        produto: Array.isArray(ordemRaw.produto) ? ordemRaw.produto[0] : ordemRaw.produto,
      } as OrdemOperacao)
    : null

  if (erroOrdem || !ordem) {
    return NextResponse.json({ error: 'Ordem nao encontrada' }, { status: 404 })
  }
  if (!ordem.maquina_id) {
    return NextResponse.json({ error: 'Ordem precisa estar agendada em uma maquina' }, { status: 409 })
  }

  const agora = new Date().toISOString()

  if (acao === 'iniciar') {
    if (ordem.status === 'concluida' || ordem.status === 'cancelada') {
      return NextResponse.json({ error: 'Ordem ja encerrada' }, { status: 409 })
    }

    if (ordem.status !== 'produzindo') {
      const { data: emExecucao } = await supabase
        .from('ordens')
        .select('id')
        .eq('maquina_id', ordem.maquina_id)
        .eq('status', 'produzindo')
        .neq('id', ordemId)
        .limit(1)

      if (Array.isArray(emExecucao) && emExecucao.length > 0) {
        return NextResponse.json(
          { error: 'Ja existe uma ordem em producao nessa maquina. Finalize antes de iniciar outra.' },
          { status: 409 }
        )
      }
    }

    const inicioRealIso = ordem.inicio_operacao_em ?? agora
    const duracaoPlanejadaMin = await calcularDuracaoPlanejadaMin(supabase, ordem)
    const fimPrevistoIso = calcularFim(new Date(inicioRealIso), duracaoPlanejadaMin).toISOString()

    const { data: atualizada, error: erroUpdate } = await supabase
      .from('ordens')
      .update({
        status: 'produzindo',
        inicio_operacao_em: inicioRealIso,
        fim_operacao_em: null,
        fim_calculado: fimPrevistoIso,
      })
      .eq('id', ordemId)
      .select('*')
      .single()

    if (erroUpdate) {
      return NextResponse.json({ error: erroUpdate.message }, { status: 400 })
    }

    if (!ordem.inicio_operacao_em) {
      await supabase.from('eventos_timer').insert({
        ordem_id: ordemId,
        maquina_id: ordem.maquina_id,
        tipo: 'inicio',
        timestamp: inicioRealIso,
      })
    }

    return NextResponse.json(atualizada)
  }

  if (ordem.status === 'concluida' || ordem.status === 'cancelada') {
    return NextResponse.json({ error: 'Ordem ja encerrada' }, { status: 409 })
  }

  const { data: atualizada, error: erroUpdate } = await supabase
    .from('ordens')
    .update({
      status: 'concluida',
      inicio_operacao_em: ordem.inicio_operacao_em ?? agora,
      fim_operacao_em: agora,
    })
    .eq('id', ordemId)
    .select('*')
    .single()

  if (erroUpdate) {
    return NextResponse.json({ error: erroUpdate.message }, { status: 400 })
  }

  await supabase.from('eventos_timer').insert({
    ordem_id: ordemId,
    maquina_id: ordem.maquina_id,
    tipo: 'conclusao',
    timestamp: agora,
  })

  return NextResponse.json(atualizada)
}
