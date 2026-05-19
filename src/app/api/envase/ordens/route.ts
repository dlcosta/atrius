import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PlanningStatus } from '@/types'

type ItemBody = {
  numero_pedido: string
  produto_descricao: string
  quantidade: number
  total_litros: number
}

type PostBody = {
  produto_base: string
  embalagem_label: string
  embalagem_volume_ml: number
  nome_ordem: string
  data_prevista: string
  maquina_id: string | null
  origin_tank_order_id: string | null
  total_litros: number
  total_embalagens: number
  package_volume_liters: number
  units_per_box: number
  production_time_minutes?: number | null
  cleaning_time_minutes?: number | null
  itens: ItemBody[]
}

function validar(body: Partial<PostBody>): string | null {
  if (!body.produto_base?.trim()) return 'produto_base obrigatório'
  if (!body.embalagem_label?.trim()) return 'embalagem_label obrigatório'
  if (!body.nome_ordem?.trim()) return 'nome_ordem obrigatório'
  if (!body.data_prevista?.trim()) return 'data_prevista obrigatória'
  if (!body.total_litros || body.total_litros <= 0) return 'total_litros deve ser maior que zero'
  if (!Array.isArray(body.itens) || body.itens.length === 0) return 'itens não pode ser vazio'
  return null
}

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ordens')
    .select(`
      *,
      agendamentos_producao (
        id,
        tank_id,
        data_agendamento,
        turno_id
      )
    `)
    .eq('etapa', 'envase')
    .in('planning_status', ['SCHEDULED', 'IN_PRODUCTION', 'WAITING_TANK'])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ordens = (data as any[]).map((o) => {
    const agendamento = o.agendamentos_producao?.[0]
    return {
      ...o,
      maquina_id: o.maquina_id ?? agendamento?.maquina_id,
      data_prevista: agendamento?.data_agendamento ?? o.data_prevista,
    }
  })

  return NextResponse.json(ordens)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body: Partial<PostBody> = await req.json()

  const erroValidacao = validar(body)
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 422 })

  const {
    produto_base,
    embalagem_label,
    embalagem_volume_ml,
    nome_ordem,
    data_prevista,
    maquina_id,
    origin_tank_order_id,
    total_litros,
    total_embalagens,
    package_volume_liters,
    units_per_box,
    production_time_minutes,
    cleaning_time_minutes,
    itens,
  } = body as PostBody

  const prodMin = production_time_minutes ?? null
  const cleanMin = cleaning_time_minutes ?? null
  const totalMin = prodMin !== null ? (prodMin + (cleanMin ?? 0)) : null

  // Verificar status do tanque de origem para definir planning_status
  let planningStatus: PlanningStatus = 'BACKLOG'
  if (origin_tank_order_id) {
    const { data: tanqueOrigem } = await supabase
      .from('ordens')
      .select('planning_status')
      .eq('id', origin_tank_order_id)
      .single()

    if (tanqueOrigem) {
      planningStatus = tanqueOrigem.planning_status === 'COMPLETED' ? 'BACKLOG' : 'WAITING_TANK'
    }
  }

  const numero_externo = `${nome_ordem}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`

  const { data: ordem, error: ordemError } = await supabase
    .from('ordens')
    .insert({
      numero_externo,
      produto_sku: null,
      quantidade: total_litros,
      unidade: 'L',
      etapa: 'envase',
      status: 'aguardando',
      planning_status: planningStatus,
      calc_mode: 'LITERS_MASTER',
      maquina_id: maquina_id ?? null,
      origin_tank_order_id: origin_tank_order_id ?? null,
      package_volume_liters: package_volume_liters ?? (embalagem_volume_ml / 1000),
      units_per_box: units_per_box ?? 1,
      box_volume_liters: ((embalagem_volume_ml / 1000) * (units_per_box ?? 1)) || null,
      estimated_boxes: total_embalagens > 0 ? total_embalagens : null,
      data_prevista,
      tanque: `${produto_base} ${embalagem_label}`,  // label legível para referência
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

  await supabase.from('ordens_audit_log').insert({
    ordem_id: ordem.id,
    operacao: 'CRIADO',
    descricao: `Ordem de envase "${nome_ordem}" criada com ${total_litros.toLocaleString('pt-BR')}L — ${produto_base} ${embalagem_label}`,
    dados_depois: {
      planning_status: planningStatus,
      maquina_id,
      origin_tank_order_id,
      total_litros,
      total_embalagens,
      production_time_minutes: prodMin,
      cleaning_time_minutes: cleanMin,
      itens_count: itens.length,
    },
  })

  return NextResponse.json(ordem, { status: 201 })
}
