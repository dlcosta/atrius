import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularDuracao, calcularFim, detectarConflito } from '@/lib/planning/engine'
import { validarNovaOrdem } from '@/lib/ordens/criar-ordem'
import {
  inferirEtapa,
  mapearVolumeReferenciaPorOrdem,
  obterVolumeReferenciaLitros,
} from '@/lib/ordens/volume'
import type { EtapaOrdem, Ordem } from '@/types'

type LinhaVolume = {
  id: string
  quantidade: number
  unidade: string | null
  lote: string | null
  etapa: EtapaOrdem | null
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function normalizarTexto(valor: unknown): string | null {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  return texto ? texto : null
}

function normalizarEtapa(valor: unknown, sku?: string | null, unidade?: string | null): EtapaOrdem {
  if (valor === 'tanque' || valor === 'envase') return valor
  return inferirEtapa(sku, unidade)
}

function isDateInRange(dataIso: string | null | undefined, inicioMs: number, fimMs: number): boolean {
  if (!dataIso) return false
  const t = new Date(dataIso).getTime()
  return Number.isFinite(t) && t >= inicioMs && t <= fimMs
}

function isDateOnlyInRange(dataYmd: string | null | undefined, inicioYmd: string, fimYmd: string): boolean {
  if (!dataYmd) return false
  return dataYmd >= inicioYmd && dataYmd <= fimYmd
}

async function carregarVolumeReferencia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ordem: { id: string; quantidade: number; unidade: string | null; lote: string | null; etapa: EtapaOrdem }
): Promise<number> {
  if (!ordem.lote) return Number(ordem.quantidade)

  const { data: doLote } = await supabase
    .from('ordens')
    .select('id, quantidade, unidade, lote, etapa')
    .eq('lote', ordem.lote)

  if (!Array.isArray(doLote) || doLote.length === 0) {
    return Number(ordem.quantidade)
  }

  const volumePorOrdem = mapearVolumeReferenciaPorOrdem(doLote as LinhaVolume[])
  return obterVolumeReferenciaLitros(ordem, volumePorOrdem)
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const data = searchParams.get('data')
  const diasParam = searchParams.get('dias')

  let query = supabase
    .from('ordens')
    .select('*, produto:produtos(*), maquina:maquinas(*)')
    .neq('status', 'cancelada')
    .order('inicio_agendado', { ascending: true, nullsFirst: false })

  if (data && !DATE_REGEX.test(data)) {
    return NextResponse.json({ error: 'data invalida' }, { status: 400 })
  }

  let dias: number | null = null
  if (diasParam) {
    const parsed = Number(diasParam)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60) {
      return NextResponse.json({ error: 'dias invalido (use 1..60)' }, { status: 400 })
    }
    dias = parsed
  }

  if (data && !dias) {
    query = query.or(`data_prevista.eq.${data},inicio_agendado.is.null`)
  }

  const { data: ordens, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let lista = Array.isArray(ordens) ? ordens : []

  if (dias) {
    const baseDateYmd = data ?? new Date().toISOString().slice(0, 10)
    const base = new Date(`${baseDateYmd}T00:00:00`)
    const inicio = new Date(base)
    inicio.setDate(inicio.getDate() - (dias - 1))
    const fim = new Date(base)
    fim.setHours(23, 59, 59, 999)

    const inicioMs = inicio.getTime()
    const fimMs = fim.getTime()
    const inicioYmd = inicio.toISOString().slice(0, 10)
    const fimYmd = baseDateYmd

    lista = lista.filter((ordem) => {
      return (
        isDateOnlyInRange(ordem.data_prevista, inicioYmd, fimYmd) ||
        isDateInRange(ordem.inicio_agendado, inicioMs, fimMs) ||
        isDateInRange(ordem.inicio_operacao_em, inicioMs, fimMs) ||
        isDateInRange(ordem.fim_operacao_em, inicioMs, fimMs)
      )
    })
  }

  const volumePorOrdem = mapearVolumeReferenciaPorOrdem(
    lista.map((ordem) => ({
      id: ordem.id,
      quantidade: Number(ordem.quantidade),
      unidade: ordem.unidade,
      lote: ordem.lote,
      etapa: normalizarEtapa(ordem.etapa, ordem.produto_sku, ordem.unidade),
    }))
  )

  const comVolume = lista.map((ordem) => ({
    ...ordem,
    produto: ordem.produto
      ? {
          ...ordem.produto,
          tempo_limpeza_min: 0,
        }
      : ordem.produto,
    etapa: normalizarEtapa(ordem.etapa, ordem.produto_sku, ordem.unidade),
    quantidade_referencia_litros: volumePorOrdem[ordem.id] ?? Number(ordem.quantidade),
  }))

  return NextResponse.json(comVolume)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const id = body.id as string | undefined
  const inicio_agendado = body.inicio_agendado as string | null | undefined
  const maquina_id = body.maquina_id as string | null | undefined

  if (!id) return NextResponse.json({ error: 'id obrigatorio' }, { status: 400 })

  const metaUpdates: Record<string, unknown> = {}
  if (body.tanque !== undefined) metaUpdates.tanque = normalizarTexto(body.tanque)
  if (body.lote !== undefined) metaUpdates.lote = normalizarTexto(body.lote)
  if (body.etapa !== undefined) metaUpdates.etapa = normalizarEtapa(body.etapa)

  // Atualizacao de metadados sem agendamento
  if (inicio_agendado === undefined && maquina_id === undefined) {
    if (Object.keys(metaUpdates).length === 0) {
      return NextResponse.json({ error: 'nenhuma alteracao enviada' }, { status: 422 })
    }

    const { data: updated, error } = await supabase
      .from('ordens')
      .update(metaUpdates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(updated)
  }

  // Desagendar
  if (inicio_agendado === null) {
    const { data: updated, error } = await supabase
      .from('ordens')
      .update({ maquina_id: null, inicio_agendado: null, fim_calculado: null, ...metaUpdates })
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(updated)
  }

  if (!maquina_id || !inicio_agendado) {
    return NextResponse.json({ error: 'maquina_id e inicio_agendado sao obrigatorios' }, { status: 422 })
  }

  const { data: ordemData } = await supabase
    .from('ordens')
    .select('id, quantidade, unidade, tanque, lote, etapa, produto_sku, produto:produtos(volume_base, tempos_maquinas)')
    .eq('id', id)
    .single()

  if (!ordemData) return NextResponse.json({ error: 'Ordem nao encontrada' }, { status: 404 })

  const produto = Array.isArray(ordemData.produto) ? ordemData.produto[0] : ordemData.produto
  if (!produto) return NextResponse.json({ error: 'Ordem sem produto vinculado' }, { status: 422 })

  const etapa = normalizarEtapa(metaUpdates.etapa ?? ordemData.etapa, ordemData.produto_sku, ordemData.unidade)

  const volumeReferencia = await carregarVolumeReferencia(supabase, {
    id,
    quantidade: Number(ordemData.quantidade),
    unidade: ordemData.unidade,
    lote: (metaUpdates.lote as string | null | undefined) ?? ordemData.lote,
    etapa,
  })

  const inicio = new Date(inicio_agendado)
  const tempos = produto.tempos_maquinas?.[maquina_id] || { setup: 0, producao: 0 }
  const duracaoMin = calcularDuracao(volumeReferencia, Number(produto.volume_base), tempos.setup, tempos.producao)
  const fim = calcularFim(inicio, duracaoMin)

  const { data: ordensExistentes } = await supabase
    .from('ordens')
    .select('id, maquina_id, inicio_agendado, fim_calculado')
    .eq('maquina_id', maquina_id)
    .not('id', 'eq', id)
    .not('inicio_agendado', 'is', null)

  const candidata: Ordem = {
    id,
    numero_externo: '',
    produto_sku: null,
    maquina_id,
    quantidade: 0,
    unidade: '',
    tanque: (metaUpdates.tanque as string | null | undefined) ?? ordemData.tanque,
    lote: (metaUpdates.lote as string | null | undefined) ?? ordemData.lote,
    etapa,
    data_prevista: null,
    inicio_agendado: inicio.toISOString(),
    fim_calculado: fim.toISOString(),
    quantidade_referencia_litros: volumeReferencia,
    status: 'aguardando',
    sincronizado_em: '',
  }

  if (detectarConflito(candidata, (ordensExistentes as Ordem[]) ?? [])) {
    return NextResponse.json({ error: 'Conflito de horario nessa maquina' }, { status: 409 })
  }

  const updates: Record<string, unknown> = {
    maquina_id,
    inicio_agendado: inicio.toISOString(),
    fim_calculado: fim.toISOString(),
    etapa,
    ...metaUpdates,
  }

  const { data: updated, error } = await supabase
    .from('ordens')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(updated)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const resultado = validarNovaOrdem({
    produto_sku: body.produto_sku ?? '',
    quantidade: Number(body.quantidade ?? 0),
    unidade: body.unidade ?? '',
    data_prevista: body.data_prevista ?? '',
  })

  if (resultado.erro) {
    return NextResponse.json({ error: resultado.erro }, { status: 422 })
  }

  const unidade = resultado.dadosNormalizados!.unidade

  const { data: produto } = await supabase
    .from('produtos')
    .select('sku')
    .eq('sku', body.produto_sku)
    .single()

  if (!produto) {
    return NextResponse.json({ error: 'Produto nao encontrado' }, { status: 404 })
  }

  const numero_externo = `MAN-${Date.now()}`
  const etapa = normalizarEtapa(body.etapa, body.produto_sku, unidade)

  const { data: nova, error } = await supabase
    .from('ordens')
    .insert({
      numero_externo,
      produto_sku: body.produto_sku,
      quantidade: Number(body.quantidade),
      unidade,
      data_prevista: body.data_prevista,
      tanque: normalizarTexto(body.tanque),
      lote: normalizarTexto(body.lote),
      etapa,
      status: 'aguardando',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(nova, { status: 201 })
}
