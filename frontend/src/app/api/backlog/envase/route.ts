import type { PlanningStatus } from '@/types'

export type OrdemBacklogEnvaseItem = {
  id: string
  numero_externo: string
  produto_sku: string | null
  produto_descricao: string
  produto_base: string
  embalagem_label: string
  embalagem_volume_ml: number
  litros_por_unidade: number
  unidades_por_cx: number
  confianca_embalagem: 'alta' | 'media' | 'manual'
  quantidade: number
  unidade: string
  total_litros: number
  total_embalagens: number
  data_prevista: string | null
  planning_status: PlanningStatus
  maquina_id: string | null
  origin_tank_order_id: string | null
  origin_tank_status: PlanningStatus | null
  origin_tank_nome: string | null
  setup_time_minutes: number | null
  production_time_minutes: number | null
  cleaning_time_minutes: number | null
  total_duration_minutes: number | null
  calc_mode: string | null
  sincronizado_em: string
  pedidos: {
    id: string
    numero_pedido: string
    produto_descricao: string
    quantidade: number
    total_litros: number
  }[]
  pedidos_count: number
  total_litros_pedidos: number
}
