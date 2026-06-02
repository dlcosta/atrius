export type Maquina = {
  id: string
  nome: string
  ativa: boolean
  criado_em: string
}

export type Operador = {
  id: string
  nome: string
  ativo: boolean
  criado_em: string
}

export type Tanque = {
  id: string
  nome: string
  volume_liters: number
  ativo: boolean
  criado_em: string
}

export type Turno = {
  id: string
  nome: string
  hora_inicio: number
  hora_fim: number
  ativo: boolean
  criado_em: string
}

export type TempoMaquina = {
  setup: number
  producao: number
}

export type Produto = {
  id: string
  sku: string
  nome: string
  volume_base: number
  tempo_limpeza_min: number
  tempos_maquinas: Record<string, TempoMaquina>
  cor: string
  criado_em: string
}

export type EtapaOrdem = 'tanque' | 'envase'

export type StatusOrdem =
  | 'aguardando'
  | 'produzindo'
  | 'pausada'
  | 'limpeza'
  | 'concluida'
  | 'atrasada'
  | 'cancelada'

export type PlanningStatus =
  | 'BACKLOG'
  | 'WAITING_TANK'
  | 'READY_TO_SCHEDULE'
  | 'SCHEDULED'
  | 'IN_PRODUCTION'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELED'

export type CalcMode = 'LITERS_MASTER' | 'BOXES_MASTER'
export type FlowSource = 'legado' | 'novo_fluxo_tanque' | 'novo_fluxo_envase'

export type Ordem = {
  id: string
  numero_externo: string
  produto_sku: string | null
  maquina_id: string | null
  quantidade: number  // Stored in liters when etapa='tanque'
  unidade: string
  tanque: string | null
  lote: string | null
  etapa: EtapaOrdem
  tank_id?: string | null
  turno_id?: string | null
  tank_volume_liters?: number | null
  package_volume_liters?: number | null
  units_per_box?: number | null
  box_volume_liters?: number | null
  estimated_boxes?: number | null
  setup_time_minutes?: number | null
  production_time_minutes?: number | null
  cleaning_time_minutes?: number | null
  total_duration_minutes?: number | null
  planning_status?: PlanningStatus | null
  calc_mode?: CalcMode | null
  color?: string | null
  origin_tank_order_id?: string | null
  origin_tank_liters?: number | null
  origin_tank_filled_liters?: number | null
  origin_tank_delta_liters?: number | null
  origin_tank_balance_status?: 'BALANCED' | 'UNDER' | 'OVER' | null
  data_prevista: string | null
  inicio_agendado: string | null  // ISO string
  fim_calculado: string | null    // ISO string
  fim_estimado?: string | null     // ISO string — fim estimado operacional (timer ao vivo)
  inicio_operacao_em?: string | null
  fim_operacao_em?: string | null
  pausado_em?: string | null
  tempo_restante_pausado_seg?: number | null
  operador_id?: string | null
  operador_nome?: string | null
  observacao_pausa?: string | null
  notes?: string | null
  flow_source?: FlowSource
  duracao_planejada_min?: number | null
  quantidade_referencia_litros?: number | null
  status: StatusOrdem
  sincronizado_em: string
  // join opcionais
  produto?: Produto
  maquina?: Maquina
  tanque_ref?: Tanque
}

export type AgendamentoProducao = {
  id: string
  ordem_id: string
  tank_id: string
  turno_id: string
  turno_nome: string
  data_agendamento: string  // YYYY-MM-DD
  duracao_planejada_min?: number | null
  data_inicio?: string | null
  data_pausa?: string | null
  data_retomada?: string | null
  data_conclusao?: string | null
  criado_em: string
}

export type EventoTimer = {
  id: string
  ordem_id: string
  maquina_id: string
  tipo: 'inicio' | 'pausa' | 'retomada' | 'conclusao'
  timestamp: string
}

// Bloco no Gantt (setup ou producao)
export type BlocoGantt = {
  id: string
  ordemId: string
  tipo: 'setup' | 'producao' | 'limpeza'
  maquinaId: string
  produto: string      // nome do produto
  cor: string
  inicio: Date
  fim: Date
  duracao_min: number
  tanque?: string | null
  planning_status?: PlanningStatus | null
}

export type ItemDemanda = {
  data_pedido?: string | null
  pedido_situacao?: number | null
  data_prevista: string | null
  categoria_produto: string
  produto_descricao: string
  numero_pedido: string
  cliente_nome: string
  quantidade: number
  litros_por_unidade: number
  unidades_por_embalagem: number
  total_litros: number
  alocado?: boolean
  ordem_id?: string | null
  ordem_status?: string | null
}

export type ItemDemandaEnvase = {
  data_prevista: string | null
  produto_descricao: string
  produto_base: string
  embalagem_label: string
  embalagem_volume_ml: number
  litros_por_unidade: number
  unidades_por_cx: number
  numero_pedido: string
  cliente_nome: string
  quantidade: number
  total_litros: number
  confianca_embalagem: 'alta' | 'media' | 'manual'
  alocado: boolean
  ordem_id: string | null
  ordem_status: string | null
}

export type OrdemPedidoErp = {
  id: string
  ordem_id: string
  numero_pedido: string
  produto_descricao: string
  quantidade: number
  total_litros: number
  criado_em: string
}

export type AuditOperacao =
  | 'CRIADO'
  | 'AGENDADO'
  | 'REAGENDADO'
  | 'CANCELADO'
  | 'STATUS_ALTERADO'
  | 'EDITADO'
  | 'INICIADO'
  | 'PAUSADO'
  | 'RETOMADO'
  | 'CONCLUIDO'

export type AuditLog = {
  id: string
  ordem_id: string
  agendamento_id: string | null
  operacao: AuditOperacao
  descricao: string
  dados_antes: Record<string, unknown> | null
  dados_depois: Record<string, unknown> | null
  responsavel: string | null
  motivo: string | null
  criado_em: string
}

export type AgendamentoProducaoDetalhado = AgendamentoProducao & {
  tank_nome?: string
}

export type ItemConferencia = ItemDemanda & {
  nome_ordem?: string | null
  data_agendamento?: string | null
  turno_nome?: string | null
  tank_nome?: string | null
}

export type OrdemHistorico = Ordem & {
  agendamentos: AgendamentoProducaoDetalhado[]
  pedidos_vinculados: OrdemPedidoErp[]
  audit_count: number
}
