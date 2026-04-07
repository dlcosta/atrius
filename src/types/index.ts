export type Maquina = {
  id: string
  nome: string
  ativa: boolean
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
  | 'limpeza'
  | 'concluida'
  | 'atrasada'
  | 'cancelada'

export type Ordem = {
  id: string
  numero_externo: string
  produto_sku: string | null
  maquina_id: string | null
  quantidade: number
  unidade: string
  tanque: string | null
  lote: string | null
  etapa: EtapaOrdem
  data_prevista: string | null
  inicio_agendado: string | null  // ISO string
  fim_calculado: string | null    // ISO string
  inicio_operacao_em?: string | null
  fim_operacao_em?: string | null
  quantidade_referencia_litros?: number | null
  status: StatusOrdem
  sincronizado_em: string
  // join opcionais
  produto?: Produto
  maquina?: Maquina
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
}
