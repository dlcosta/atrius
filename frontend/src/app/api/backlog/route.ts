export type OrdemBacklogItem = {
  id: string
  numero_externo: string
  tanque: string | null
  tank_id: string | null
  quantidade: number
  unidade: string
  data_prevista: string | null
  planning_status: string
  etapa: string
  setup_time_minutes: number | null
  production_time_minutes: number | null
  cleaning_time_minutes: number | null
  total_duration_minutes: number | null
  tank_volume_liters: number | null
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
