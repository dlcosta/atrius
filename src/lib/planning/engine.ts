import type { Ordem, Produto, BlocoGantt } from '@/types'
import { unidadeEhLitro } from '@/lib/ordens/volume'

/** Calcula a duracao em minutos de Setup + Producao */
export function calcularDuracao(
  quantidadeReferenciaLitros: number,
  volume_base: number,
  setup_min: number,
  producao_min: number
): number {
  const volBase = volume_base || 3800
  if (quantidadeReferenciaLitros <= 0 || producao_min <= 0) return setup_min
  return setup_min + (quantidadeReferenciaLitros / volBase) * producao_min
}

/** Adiciona duracao_min ao inicio e retorna o fim */
export function calcularFim(inicio: Date, duracao_min: number): Date {
  return new Date(inicio.getTime() + duracao_min * 60 * 1000)
}

/** Verifica se a ordem tem sobreposicao com qualquer outra na mesma maquina */
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

/** Ordena ordens por inicio_agendado. Sem horario vai para o fim */
export function ordenarPorInicio(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    if (!a.inicio_agendado) return 1
    if (!b.inicio_agendado) return -1
    return new Date(a.inicio_agendado).getTime() - new Date(b.inicio_agendado).getTime()
  })
}

export function gerarBlocoLimpeza(ordem: Ordem, produto: Produto): BlocoGantt | null {
  if (!ordem.maquina_id || !ordem.fim_calculado) return null
  if (!produto.tempo_limpeza_min || produto.tempo_limpeza_min <= 0) return null

  const inicio = new Date(ordem.fim_calculado)
  const fim = calcularFim(inicio, produto.tempo_limpeza_min)

  return {
    id: `limpeza-${ordem.id}`,
    ordemId: ordem.id,
    tipo: 'limpeza',
    maquinaId: ordem.maquina_id,
    produto: `Limpeza - ${produto.nome}`,
    cor: '#FDE68A',
    inicio,
    fim,
    duracao_min: produto.tempo_limpeza_min,
    tanque: ordem.tanque,
  }
}

/** Converte uma ordem em blocos para o Gantt (setup + producao + limpeza) */
export function ordemParaBlocos(ordem: Ordem): BlocoGantt[] {
  const inicioBaseIso = ordem.inicio_operacao_em ?? ordem.inicio_agendado
  if (!inicioBaseIso || !ordem.fim_calculado || !ordem.produto || !ordem.maquina_id) return []

  const blocos: BlocoGantt[] = []

  const tempos = ordem.produto.tempos_maquinas?.[ordem.maquina_id]
  const setupMin = tempos?.setup ?? 0
  const prodMin = tempos?.producao ?? 0
  const volumeReferencia =
    ordem.quantidade_referencia_litros ??
    (unidadeEhLitro(ordem.unidade) ? ordem.quantidade : ordem.quantidade)
  const duracaoProducao = (volumeReferencia / (ordem.produto.volume_base || 3800)) * prodMin

  let inicioAtual = new Date(inicioBaseIso)

  if (setupMin > 0) {
    const fimSetup = calcularFim(inicioAtual, setupMin)
    blocos.push({
      id: `setup-${ordem.id}`,
      ordemId: ordem.id,
      tipo: 'setup',
      maquinaId: ordem.maquina_id,
      produto: `Setup - ${ordem.produto.nome}`,
      cor: '#E5E7EB',
      inicio: inicioAtual,
      fim: fimSetup,
      duracao_min: setupMin,
      tanque: ordem.tanque,
    })
    inicioAtual = fimSetup
  }

  blocos.push({
    id: ordem.id,
    ordemId: ordem.id,
    tipo: 'producao',
    maquinaId: ordem.maquina_id,
    produto: ordem.produto.nome,
    cor: ordem.produto.cor,
    inicio: inicioAtual,
    fim: new Date(ordem.fim_calculado),
    duracao_min: duracaoProducao,
    tanque: ordem.tanque,
  })

  const blocoLimpeza = gerarBlocoLimpeza(ordem, ordem.produto)
  if (blocoLimpeza) blocos.push(blocoLimpeza)

  return blocos
}
