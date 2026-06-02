import { calcularFim } from '../planning/engine'

// Lógica PURA do handler POST /api/ordens/operacao.
// Nenhuma destas funções faz IO nem chama new Date() internamente — o `now` é injetado,
// tornando os testes determinísticos. O timer ao vivo vive em `fim_estimado` (persistido no
// JSON `notes`); as colunas de agendamento (inicio_agendado/fim_calculado) NUNCA são tocadas aqui.

export type OperacaoOrdem = {
  inicio_operacao_em?: string | null
  fim_estimado?: string | null
  fim_calculado?: string | null
  tempo_restante_pausado_seg?: number | null
  total_duration_minutes?: number | null
}

export type OperacaoCompat = {
  inicio_operacao_em?: string | null
  fim_operacao_em?: string | null
  pausado_em?: string | null
  tempo_restante_pausado_seg?: number | null
  operador_id?: string | null
  operador_nome?: string | null
  observacao_pausa?: string | null
  fim_estimado?: string | null
}

export function parseCompatNotes(notes: string | null | undefined): any {
  if (!notes) return {}
  try {
    const parsed = JSON.parse(notes)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    return { legacy_text: notes }
  }
  return {}
}

export function mergeCompatNotes(notes: string | null | undefined, operacao: OperacaoCompat): string {
  const atual = parseCompatNotes(notes)
  return JSON.stringify({ ...atual, operacao: { ...(atual.operacao ?? {}), ...operacao } })
}

export function computeRemainingSeconds({ ordem, now, min }: { ordem: OperacaoOrdem; now: Date; min: number }): number {
  const fimEstimadoAtual = ordem.fim_estimado ?? ordem.fim_calculado
  const raw = (() => {
    if (ordem.tempo_restante_pausado_seg && ordem.tempo_restante_pausado_seg > 0) {
      return ordem.tempo_restante_pausado_seg
    }
    if (fimEstimadoAtual) {
      const diff = Math.ceil((new Date(fimEstimadoAtual).getTime() - now.getTime()) / 1000)
      if (Number.isFinite(diff) && diff > 0) return diff
    }
    return Math.max(1, Number(ordem.total_duration_minutes || 1)) * 60
  })()
  return Math.max(min, raw)
}

type BuilderArgs = { ordem: OperacaoOrdem; now: Date; operadorId: string | null; operadorNome: string }

export function buildIniciarUpdate(
  args: BuilderArgs & { durationMinutes: number }
): Record<string, unknown> {
  const { ordem, now, operadorId, operadorNome, durationMinutes } = args
  const nowIso = now.toISOString()
  const fimEstimadoIso = calcularFim(now, durationMinutes).toISOString()
  return {
    status: 'produzindo',
    planning_status: 'IN_PRODUCTION',
    operador_id: operadorId,
    operador_nome: operadorNome,
    inicio_operacao_em: ordem.inicio_operacao_em ?? nowIso,
    fim_operacao_em: null,
    pausado_em: null,
    tempo_restante_pausado_seg: null,
    observacao_pausa: null,
    fim_estimado: fimEstimadoIso,
  }
}

export function buildPausarUpdate(args: BuilderArgs & { observacaoPausa: string }): Record<string, unknown> {
  const { ordem, now, operadorId, operadorNome, observacaoPausa } = args
  const remainingSeconds = computeRemainingSeconds({ ordem, now, min: 0 })
  return {
    status: 'pausada',
    planning_status: 'PAUSED',
    operador_id: operadorId,
    operador_nome: operadorNome,
    pausado_em: now.toISOString(),
    tempo_restante_pausado_seg: remainingSeconds,
    observacao_pausa: observacaoPausa,
  }
}

export function buildRetomarUpdate(args: BuilderArgs): Record<string, unknown> {
  const { ordem, now, operadorId, operadorNome } = args
  const remainingSeconds = computeRemainingSeconds({ ordem, now, min: 60 })
  return {
    status: 'produzindo',
    planning_status: 'IN_PRODUCTION',
    operador_id: operadorId,
    operador_nome: operadorNome,
    pausado_em: null,
    tempo_restante_pausado_seg: null,
    // Empurra o fim estimado pelo tempo que ficou pausado (timer retoma de onde parou)
    fim_estimado: new Date(now.getTime() + remainingSeconds * 1000).toISOString(),
  }
}

export function buildFinalizarUpdate(args: BuilderArgs): Record<string, unknown> {
  const { ordem, now, operadorId, operadorNome } = args
  const nowIso = now.toISOString()
  return {
    status: 'concluida',
    planning_status: 'COMPLETED',
    operador_id: operadorId,
    operador_nome: operadorNome,
    inicio_operacao_em: ordem.inicio_operacao_em ?? nowIso,
    fim_operacao_em: nowIso,
    pausado_em: null,
    tempo_restante_pausado_seg: null,
  }
}
