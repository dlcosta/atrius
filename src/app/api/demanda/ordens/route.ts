import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ItemBody = {
  numero_pedido: string
  produto_descricao: string
  quantidade: number
  total_litros: number
}

type PostBody = {
  categoria_produto: string
  data_prevista: string
  tank_id: string
  total_litros: number
  itens: ItemBody[]
}

function validar(body: Partial<PostBody>): string | null {
  if (!body.categoria_produto?.trim()) return 'categoria_produto obrigatória'
  if (!body.data_prevista?.trim()) return 'data_prevista obrigatória'
  if (!body.tank_id?.trim()) return 'tank_id obrigatório'
  if (!body.total_litros || body.total_litros <= 0) return 'total_litros deve ser maior que zero'
  if (!Array.isArray(body.itens) || body.itens.length === 0) return 'itens não pode ser vazio'
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body: Partial<PostBody> = await req.json()

  const erroValidacao = validar(body)
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 422 })

  const { categoria_produto, data_prevista, tank_id, total_litros, itens } = body as PostBody

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

  const { data: ordem, error: ordemError } = await supabase
    .from('ordens')
    .insert({
      numero_externo: `DEM-${Date.now()}`,
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

  return NextResponse.json(ordem, { status: 201 })
}
