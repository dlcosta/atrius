import type { Ordem } from '../../types'
import { unidadeEhLitro } from '../ordens/volume'

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

export function calcularFim(inicio: Date, duracao_min: number): Date {
  return new Date(inicio.getTime() + duracao_min * 60 * 1000)
}

export function detectarConflito(candidata: Ordem, existentes: Ordem[]): boolean {
  if (!candidata.inicio_agendado || !candidata.fim_calculado) return false

  const inicioC = new Date(candidata.inicio_agendado).getTime()
  const fimC = new Date(candidata.fim_calculado).getTime()
  const isTank = candidata.etapa === 'tanque'

  return existentes.some((e) => {
    if (e.id === candidata.id) return false
    if (isTank) {
      if (!candidata.tank_id || e.tank_id !== candidata.tank_id) return false
    } else if (e.maquina_id !== candidata.maquina_id) {
      return false
    }
    if (!e.inicio_agendado || !e.fim_calculado) return false

    const inicioE = new Date(e.inicio_agendado).getTime()
    const fimE = new Date(e.fim_calculado).getTime()

    return inicioC < fimE && fimC > inicioE
  })
}

export function ordenarPorInicio(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    if (!a.inicio_agendado) return 1
    if (!b.inicio_agendado) return -1
    return new Date(a.inicio_agendado).getTime() - new Date(b.inicio_agendado).getTime()
  })
}
