import { Router, Request, Response } from 'express'
import { createClient } from '../lib/supabase'
import {
  calculateProductionEndTime,
  calculateTankVolumeBalance,
  calculateTotalDuration,
  hasScheduleConflict,
  VOLUME_BALANCE_TOLERANCE_LITERS,
} from '../lib/planning/production'
import type { Ordem, PlanningStatus } from '../types'

const router = Router()

type ItemBody = {
  numero_pedido: string
  produto_descricao: string
  quantidade: number
  total_litros: number
}

type PostOrdemBody = {
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

function validarOrdem(body: Partial<PostOrdemBody>): string | null {
  if (!body.produto_base?.trim()) return 'produto_base obrigatório'
  if (!body.embalagem_label?.trim()) return 'embalagem_label obrigatório'
  if (!body.nome_ordem?.trim()) return 'nome_ordem obrigatório'
  if (!body.data_prevista?.trim()) return 'data_prevista obrigatória'
  if (!body.total_litros || body.total_litros <= 0) return 'total_litros deve ser maior que zero'
  if (!Array.isArray(body.itens) || body.itens.length === 0) return 'itens não pode ser vazio'
  return null
}

router.get('/ordens', async (_req: Request, res: Response) => {
  const supabase = createClient()

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
    return res.status(500).json({ error: error.message })
  }

  const ordens = (data as any[]).map((o) => {
    const agendamento = o.agendamentos_producao?.[0]
    return {
      ...o,
      maquina_id: o.maquina_id ?? agendamento?.maquina_id,
      data_prevista: agendamento?.data_agendamento ?? o.data_prevista,
    }
  })

  return res.json(ordens)
})

router.post('/ordens', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body: Partial<PostOrdemBody> = req.body

  const erroValidacao = validarOrdem(body)
  if (erroValidacao) return res.status(422).json({ error: erroValidacao })

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
  } = body as PostOrdemBody

  const prodMin = production_time_minutes ?? null
  const cleanMin = cleaning_time_minutes ?? null
  const totalMin = prodMin !== null ? (prodMin + (cleanMin ?? 0)) : null

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
      tanque: `${produto_base} ${embalagem_label}`,
      production_time_minutes: prodMin,
      cleaning_time_minutes: cleanMin,
      total_duration_minutes: totalMin,
    })
    .select('*')
    .single()

  if (ordemError || !ordem) {
    return res.status(500).json({ error: `Erro ao criar ordem: ${ordemError?.message}` })
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
    return res.status(500).json({ error: `Erro ao vincular pedidos: ${vinculosError.message}` })
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

  return res.status(201).json(ordem)
})

type PostCadastroBody = {
  produto_sku?: string
  origin_tank_order_id?: string
  maquina_id?: string
  data_prevista?: string
  inicio_agendado?: string
  nome_produto?: string
  embalagem_label?: string
  package_volume_liters?: number
  units_per_box?: number
  quantidade_embalagens?: number
  quantidade_unidades_avulsas?: number
  total_unidades?: number
  total_litros?: number
  production_time_minutes?: number
  cleaning_time_minutes?: number
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function validarCadastro(body: PostCadastroBody): string | null {
  if (!body.produto_sku?.trim()) return 'produto_sku obrigatorio'
  if (!body.origin_tank_order_id?.trim()) return 'origin_tank_order_id obrigatorio'
  if (!body.maquina_id?.trim()) return 'maquina_id obrigatorio'
  if (!body.data_prevista?.trim()) return 'data_prevista obrigatoria'
  if (!DATE_REGEX.test(body.data_prevista)) return 'data_prevista invalida'
  if (!body.inicio_agendado?.trim()) return 'inicio_agendado obrigatorio'
  if (!body.nome_produto?.trim()) return 'nome_produto obrigatorio'
  if (!body.embalagem_label?.trim()) return 'embalagem_label obrigatoria'
  if (!Number.isFinite(Number(body.package_volume_liters)) || Number(body.package_volume_liters) <= 0) {
    return 'package_volume_liters deve ser maior que zero'
  }
  if (!Number.isFinite(Number(body.units_per_box)) || Number(body.units_per_box) <= 0) {
    return 'units_per_box deve ser maior que zero'
  }
  if (!Number.isFinite(Number(body.total_unidades)) || Number(body.total_unidades) <= 0) {
    return 'total_unidades deve ser maior que zero'
  }
  if (!Number.isFinite(Number(body.total_litros)) || Number(body.total_litros) <= 0) {
    return 'total_litros deve ser maior que zero'
  }
  if (!Number.isFinite(Number(body.production_time_minutes)) || Number(body.production_time_minutes) <= 0) {
    return 'production_time_minutes deve ser maior que zero'
  }
  if (!Number.isFinite(Number(body.cleaning_time_minutes)) || Number(body.cleaning_time_minutes) < 0) {
    return 'cleaning_time_minutes deve ser maior ou igual a zero'
  }
  return null
}

router.post('/cadastro', async (req: Request, res: Response) => {
  const supabase = createClient()
  const body = req.body as PostCadastroBody

  const erroValidacao = validarCadastro(body)
  if (erroValidacao) return res.status(422).json({ error: erroValidacao })

  const startAt = new Date(String(body.inicio_agendado))
  if (!Number.isFinite(startAt.getTime())) {
    return res.status(422).json({ error: 'inicio_agendado invalido' })
  }

  const productionTimeMinutes = Math.round(Number(body.production_time_minutes))
  const cleaningTimeMinutes = Math.round(Number(body.cleaning_time_minutes))
  const totalDurationMinutes = Math.max(
    1,
    calculateTotalDuration({
      setupTimeMinutes: 0,
      productionTimeMinutes,
      cleaningTimeMinutes,
    })
  )
  const endAt = calculateProductionEndTime(startAt, totalDurationMinutes)

  const { data: produto, error: produtoError } = await supabase
    .from('produtos')
    .select('sku, cor')
    .eq('sku', body.produto_sku)
    .single()

  if (produtoError || !produto) {
    return res.status(404).json({ error: 'Produto nao encontrado' })
  }

  const { data: originTank, error: originError } = await supabase
    .from('ordens')
    .select('id, etapa, quantidade, lote, planning_status, status')
    .eq('id', body.origin_tank_order_id)
    .single()

  if (originError || !originTank) {
    return res.status(404).json({ error: 'Ordem de tanque nao encontrada' })
  }

  const origem = originTank as any
  if (origem.etapa !== 'tanque') {
    return res.status(422).json({ error: 'Origem informada nao e uma ordem de tanque' })
  }
  if (origem.planning_status !== 'COMPLETED') {
    return res.status(422).json({ error: 'Somente ordens de tanque concluidas podem originar envase' })
  }
  if (origem.planning_status === 'CANCELED' || origem.status === 'cancelada') {
    return res.status(422).json({ error: 'Ordem de tanque cancelada nao pode ser usada' })
  }

  const { data: fillingOrders, error: fillingError } = await supabase
    .from('ordens')
    .select('quantidade, planning_status, status')
    .eq('etapa', 'envase')
    .eq('origin_tank_order_id', body.origin_tank_order_id)

  if (fillingError) {
    return res.status(500).json({ error: fillingError.message })
  }

  const alreadyFilledLiters = ((fillingOrders as any[] | null) ?? []).reduce((acc: number, row: any) => {
    if (row.planning_status === 'CANCELED' || row.status === 'cancelada') return acc
    return acc + Number(row.quantidade || 0)
  }, 0)

  const balance = calculateTankVolumeBalance({
    tankLiters: Number(origem.quantidade || 0),
    alreadyFilledLiters,
    currentFillingLiters: Number(body.total_litros || 0),
    tolerance: VOLUME_BALANCE_TOLERANCE_LITERS,
  })

  if (balance.status === 'OVER') {
    return res.status(422).json({
      error: `Volume de envase excede o saldo do tanque. Disponivel: ${balance.deltaLiters + Number(body.total_litros || 0)}L`,
    })
  }

  const { data: scheduledOrders } = await supabase
    .from('ordens')
    .select('*')
    .eq('etapa', 'envase')
    .not('inicio_agendado', 'is', null)

  const hasConflict = hasScheduleConflict({
    productionType: 'FILLING',
    machineId: body.maquina_id ?? null,
    newStart: startAt,
    newEnd: endAt,
    existingSchedules: (scheduledOrders as Ordem[]) ?? [],
  })

  if (hasConflict) {
    return res.status(409).json({ error: 'Ja existe uma producao agendada nessa maquina para este horario.' })
  }

  const packageVolumeLiters = Number(body.package_volume_liters)
  const unitsPerBox = Math.round(Number(body.units_per_box))
  const quantityBoxes = Math.round(Number(body.quantidade_embalagens || 0))
  const quantityLooseUnits = Math.round(Number(body.quantidade_unidades_avulsas || 0))
  const totalUnits = Math.round(Number(body.total_unidades))
  const totalLiters = Number(body.total_litros)
  const calcMode = unitsPerBox > 1 && quantityLooseUnits === 0 ? 'BOXES_MASTER' : 'LITERS_MASTER'
  const boxVolumeLiters = packageVolumeLiters * unitsPerBox
  const numeroExterno = `ENV-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`

  const { data: nova, error: insertError } = await supabase
    .from('ordens')
    .insert({
      numero_externo: numeroExterno,
      produto_sku: body.produto_sku,
      quantidade: totalLiters,
      unidade: 'L',
      data_prevista: body.data_prevista,
      tanque: body.nome_produto,
      lote: origem.lote,
      etapa: 'envase',
      status: 'aguardando',
      maquina_id: body.maquina_id,
      package_volume_liters: packageVolumeLiters,
      units_per_box: unitsPerBox,
      box_volume_liters: boxVolumeLiters || null,
      estimated_boxes: unitsPerBox > 1 ? quantityBoxes : null,
      setup_time_minutes: 0,
      production_time_minutes: productionTimeMinutes,
      cleaning_time_minutes: cleaningTimeMinutes,
      total_duration_minutes: totalDurationMinutes,
      inicio_agendado: startAt.toISOString(),
      fim_calculado: endAt.toISOString(),
      planning_status: 'SCHEDULED',
      calc_mode: calcMode,
      color: (produto as any).cor ?? null,
      origin_tank_order_id: body.origin_tank_order_id,
      quantidade_referencia_litros: totalLiters,
    })
    .select('*')
    .single()

  if (insertError || !nova) {
    return res.status(400).json({ error: insertError?.message ?? 'Erro ao criar ordem de envase' })
  }

  await supabase.from('ordens_audit_log').insert({
    ordem_id: nova.id,
    operacao: 'CRIADO',
    descricao: `Ordem de envase criada a partir do tanque ${body.origin_tank_order_id}`,
    dados_depois: {
      produto_sku: body.produto_sku,
      nome_produto: body.nome_produto,
      embalagem_label: body.embalagem_label,
      quantidade_embalagens: quantityBoxes,
      quantidade_unidades_avulsas: quantityLooseUnits,
      total_unidades: totalUnits,
      total_litros: totalLiters,
      maquina_id: body.maquina_id,
      inicio_agendado: startAt.toISOString(),
      fim_calculado: endAt.toISOString(),
    },
  })

  return res.status(201).json(nova)
})

export default router
