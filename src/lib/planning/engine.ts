import type { Ordem, Produto, BlocoGantt } from '@/types'

/** Adiciona duracao_min ao início e retorna o fim */
export function calcularFim(inicio: Date, duracao_min: number): Date {
  return new Date(inicio.getTime() + duracao_min * 60 * 1000)
}

/** Verifica se a ordem tem sobreposição com qualquer outra na mesma máquina */
export function detectarConflito(candidata: Ordem, existentes: Ordem[]): boolean {
  if (!candidata.inicio_agendado || !candidata.fim_calculado) return false

  const inicioC = new Date(candidata.inicio_agendado).getTime()
  const fimC = new Date(candidata.fim_calculado).getTime()

  return existentes.some((e) => {
    if (e.id === candidata.id) return false
    if (e.maquina_id !== candidata.maquina_id) return false
    if (!e.inicio_agendado || !e.fim_calculado) return false

    const inicioE = new Date(e.inicio_agendado).getTime()
    const fimE = new Date(e.fim_calculado).getTime()

    return inicioC < fimE && fimC > inicioE
  })
}

/** Gera o bloco de limpeza após uma ordem. Retorna null se não houver limpeza */
export function gerarBlocoLimpeza(
  ordem: Ordem,
  produto: Produto
): BlocoGantt | null {
  if (!ordem.fim_calculado || !ordem.maquina_id) return null
  if (produto.tempo_limpeza_min === 0) return null

  const inicio = new Date(ordem.fim_calculado)
  const fim = calcularFim(inicio, produto.tempo_limpeza_min)

  return {
    id: `limpeza-${ordem.id}`,
    ordemId: ordem.id,
    tipo: 'limpeza',
    maquinaId: ordem.maquina_id!,
    produto: `Limpeza — ${produto.nome}`,
    cor: '#FFF9C4',
    inicio,
    fim,
    duracao_min: produto.tempo_limpeza_min,
  }
}

/** Ordena ordens por inicio_agendado. Sem horário vai para o fim */
export function ordenarPorInicio(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    if (!a.inicio_agendado) return 1
    if (!b.inicio_agendado) return -1
    return new Date(a.inicio_agendado).getTime() - new Date(b.inicio_agendado).getTime()
  })
}

/** Converte lista de ordens em blocos para o Gantt (produção + limpeza) */
export function ordemParaBlocos(ordem: Ordem): BlocoGantt[] {
  if (!ordem.inicio_agendado || !ordem.fim_calculado || !ordem.produto || !ordem.maquina_id) return []

  const blocoProducao: BlocoGantt = {
    id: ordem.id,
    ordemId: ordem.id,
    tipo: 'producao',
    maquinaId: ordem.maquina_id!,
    produto: ordem.produto.nome,
    cor: ordem.produto.cor,
    inicio: new Date(ordem.inicio_agendado),
    fim: new Date(ordem.fim_calculado),
    duracao_min: ordem.produto.tempo_producao_min,
  }

  const blocoLimpeza = gerarBlocoLimpeza(ordem, ordem.produto)
  return blocoLimpeza ? [blocoProducao, blocoLimpeza] : [blocoProducao]
}
