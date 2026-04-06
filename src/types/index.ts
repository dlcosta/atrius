export type Maquina = {
  id: string
  nome: string
  ativa: boolean
  criado_em: string
}

export type Produto = {
  id: string
  sku: string
  nome: string
  tempo_producao_min: number
  tempo_limpeza_min: number
  cor: string
  criado_em: string
}

export type StatusOrdem =
  | 'aguardando'
  | 'produzindo'
  | 'limpeza'
  | 'concluida'
  | 'atrasada'

export type Ordem = {
  id: string
  numero_externo: string
  produto_sku: string | null
  maquina_id: string | null
  quantidade: number
  unidade: string
  data_prevista: string | null
  inicio_agendado: string | null  // ISO string
  fim_calculado: string | null    // ISO string
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

// Bloco no Gantt (pode ser produção ou limpeza)
export type BlocoGantt = {
  id: string           // ordem.id ou `limpeza-${ordem.id}`
  ordemId: string
  tipo: 'producao' | 'limpeza'
  maquinaId: string
  produto: string      // nome do produto
  cor: string
  inicio: Date
  fim: Date
  duracao_min: number
}
