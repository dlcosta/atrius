import { format } from 'date-fns'
import type { Ordem } from '@/types'

// Predicados PUROS de pertencimento de ordem a um dia (usados pelo Monitoramento).
// Extraídos para regressão do bug "ordens não aparecem no dia" — uma ordem pode pertencer
// ao dia pela data planejada OU por qualquer marco de agenda/operação naquele dia.

export function mesmoDia(dataIso: string | null | undefined, diaYmd: string): boolean {
  if (!dataIso) return false
  return format(new Date(dataIso), 'yyyy-MM-dd') === diaYmd
}

export function pertenceAoDia(ordem: Ordem, diaYmd: string): boolean {
  return (
    ordem.data_prevista === diaYmd ||
    mesmoDia(ordem.inicio_agendado, diaYmd) ||
    mesmoDia(ordem.inicio_operacao_em, diaYmd) ||
    mesmoDia(ordem.fim_operacao_em, diaYmd)
  )
}
