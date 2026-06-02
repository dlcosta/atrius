// Predicados PUROS de filtro de data usados pelo GET /api/ordens.
// Extraídos para teste de regressão do bug do dashboard (ordem não aparecia no dia
// quando `data_prevista` divergia de `inicio_agendado`).

export function isDateInRange(dataIso: string | null | undefined, inicioMs: number, fimMs: number): boolean {
  if (!dataIso) return false
  const t = new Date(dataIso).getTime()
  return Number.isFinite(t) && t >= inicioMs && t <= fimMs
}

export function isDateOnlyInRange(
  dataYmd: string | null | undefined,
  inicioYmd: string,
  fimYmd: string
): boolean {
  if (!dataYmd) return false
  return dataYmd >= inicioYmd && dataYmd <= fimYmd
}

type OrdemData = {
  data_prevista?: string | null
  inicio_agendado?: string | null
}

// Uma ordem pertence ao dia `ymd` se a data planejada for esse dia OU se o início agendado
// cair dentro desse dia (janela UTC), mesmo que `data_prevista` aponte para outro dia.
export function ordemPertenceAoDia(ordem: OrdemData, ymd: string): boolean {
  if (ordem.data_prevista === ymd) return true
  const inicioMs = Date.parse(`${ymd}T00:00:00.000Z`)
  const fimMs = Date.parse(`${ymd}T23:59:59.999Z`)
  return isDateInRange(ordem.inicio_agendado, inicioMs, fimMs)
}
