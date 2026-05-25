import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Ordem } from '@/types'

type ItemBody = {
  numero_pedido: string
  produto_descricao: string
  quantidade: number
  total_litros: number
}

type PostBody = {
  categoria_produto: string
  nome_ordem: string
  data_prevista: string
  tank_id: string
  total_litros: number
  itens: ItemBody[]
  production_time_minutes?: number
  cleaning_time_minutes?: number
}

function validar(body: Partial<PostBody>): string | null {
  if (!body.categoria_produto?.trim()) return 'categoria_produto obrigatória'
  if (!body.nome_ordem?.trim()) return 'nome_ordem obrigatório'
  if (!body.data_prevista?.trim()) return 'data_prevista obrigatória'
  if (!body.tank_id?.trim()) return 'tank_id obrigatório'
  if (!body.total_litros || body.total_litros <= 0) return 'total_litros deve ser maior que zero'
  if (!Array.isArray(body.itens) || body.itens.length === 0) return 'itens não pode ser vazio'
  if (body.production_time_minutes !== undefined && body.production_time_minutes !== null && body.production_time_minutes <= 0)
    return 'production_time_minutes deve ser maior que zero'
  return null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ordens')
    .select(`
      *,
      agendamentos_producao!inner (
        id,
        tank_id,
        data_agendamento,
        turno_id
      )
    `)
    .eq('etapa', 'tanque')
    .in('planning_status', ['SCHEDULED', 'IN_PRODUCTION'])

  if (error) {
    console.error('[demanda/ordens] erro ao buscar:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ordensComAgendamento = (data as any[])?.map(ordem => {
    const agendamento = ordem.agendamentos_producao?.[0]
    const dataAgendamento = agendamento?.data_agendamento
      ? (typeof agendamento.data_agendamento === 'string'
          ? agendamento.data_agendamento
          : new Date(agendamento.data_agendamento).toISOString().split('T')[0])
      : ordem.data_prevista

    return {
      ...ordem,
      tank_id: agendamento?.tank_id,
      turno_id: agendamento?.turno_id,
      data_prevista: dataAgendamento,
      planning_status: ordem.planning_status,
    }
  }) ?? []

  return NextResponse.json(ordensComAgendamento)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body: Partial<PostBody> = await req.json()

  const erroValidacao = validar(body)
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 422 })

  const { categoria_produto, nome_ordem, data_prevista, tank_id, total_litros, itens, production_time_minutes, cleaning_time_minutes } = body as PostBody
  const prodMin = production_time_minutes ?? null
  const cleanMin = cleaning_time_minutes ?? null
  const totalMin = prodMin !== null && cleanMin !== null ? prodMin + cleanMin : prodMin !== null ? prodMin : null

  const { data: tanque, error: tanqueError } = await supabase
    .from('tanques')
    .select('volume_liters')
    .eq('id', tank_id)
    .maybeSingle()

  if (tanqueError || !tanque) {
    return NextResponse.json({ error: 'Tanque não encontrado' }, { status: 404 })
  }

  if (total_litros > tanque.volume_liters) {
    return NextResponse.json(
      { error: `Volume ${total_litros}L ultrapassa a capacidade do tanque (${tanque.volume_liters}L)` },
      { status: 422 }
    )
  }

  const numero_externo = `${nome_ordem}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`

  const { data: ordem, error: ordemError } = await supabase
    .from('ordens')
    .insert({
      numero_externo,
      produto_sku: null,
      quantidade: total_litros,
      unidade: 'L',
      etapa: 'tanque',
      status: 'aguardando',
      planning_status: 'BACKLOG',
      calc_mode: 'LITERS_MASTER',
      tank_id,
      tank_volume_liters: tanque.volume_liters,
      data_prevista,
      tanque: categoria_produto,
      production_time_minutes: prodMin,
      cleaning_time_minutes: cleanMin,
      total_duration_minutes: totalMin,
    })
    .select('*')
    .single()

  if (ordemError || !ordem) {
    return NextResponse.json({ error: `Erro ao criar ordem: ${ordemError?.message}` }, { status: 500 })
  }

  const vinculos = itens.map((item) => ({
    ordem_id: ordem.id,
    numero_pedido: item.numero_pedido,
    produto_descricao: item.produto_descricao,
    quantidade: item.quantidade,
    total_litros: item.total_litros,
  }))

  const { error: vinculosError } = await supabase.from('ordens_pedidos_erp').insert(vinculos)

  if (vinculosError) {
    await supabase.from('ordens').delete().eq('id', ordem.id)
    return NextResponse.json({ error: `Erro ao vincular pedidos: ${vinculosError.message}` }, { status: 500 })
  }

  // Registrar log de criação
  await supabase.from('ordens_audit_log').insert({
    ordem_id: ordem.id,
    operacao: 'CRIADO',
    descricao: `Ordem "${nome_ordem}" criada com ${total_litros.toLocaleString('pt-BR')}L — ${categoria_produto}`,
    dados_depois: {
      planning_status: 'BACKLOG',
      tank_id,
      total_litros,
      production_time_minutes: prodMin,
      cleaning_time_minutes: cleanMin,
      total_duration_minutes: totalMin,
      itens_count: itens.length,
    },
  })

  return NextResponse.json(ordem, { status: 201 })
}
