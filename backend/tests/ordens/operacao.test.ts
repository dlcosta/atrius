import { describe, expect, it } from 'vitest'
import {
  parseCompatNotes,
  mergeCompatNotes,
  computeRemainingSeconds,
  buildIniciarUpdate,
  buildPausarUpdate,
  buildRetomarUpdate,
  buildFinalizarUpdate,
} from '@/lib/ordens/operacao'

const NOW = new Date('2026-06-01T19:34:00.000Z')

describe('operacao — notes compat', () => {
  it('parseCompatNotes retorna objeto vazio para nulo/invalido', () => {
    expect(parseCompatNotes(null)).toEqual({})
    expect(parseCompatNotes(undefined)).toEqual({})
    expect(parseCompatNotes('texto livre')).toEqual({ legacy_text: 'texto livre' })
  })

  it('mergeCompatNotes preserva operador_id, observacao_pausa e fim_estimado num round-trip', () => {
    const notes = mergeCompatNotes(null, {
      operador_id: 'op-1',
      observacao_pausa: 'troca de bobina',
      fim_estimado: '2026-06-01T20:54:00.000Z',
    })
    const parsed = parseCompatNotes(notes)
    expect(parsed.operacao.operador_id).toBe('op-1')
    expect(parsed.operacao.observacao_pausa).toBe('troca de bobina')
    expect(parsed.operacao.fim_estimado).toBe('2026-06-01T20:54:00.000Z')
  })

  it('mergeCompatNotes mescla sobre operacao existente sem perder campos', () => {
    const inicial = mergeCompatNotes(null, { operador_id: 'op-1', fim_estimado: 'A' })
    const atualizado = mergeCompatNotes(inicial, { fim_estimado: 'B' })
    const parsed = parseCompatNotes(atualizado)
    expect(parsed.operacao.operador_id).toBe('op-1')
    expect(parsed.operacao.fim_estimado).toBe('B')
  })
})

describe('operacao — computeRemainingSeconds', () => {
  it('usa fim_estimado quando presente (nao fim_calculado)', () => {
    const ordem = {
      fim_estimado: '2026-06-01T19:39:00.000Z', // +5min
      fim_calculado: '2026-06-02T07:45:00.000Z', // planejado, deve ser ignorado
      tempo_restante_pausado_seg: null,
      total_duration_minutes: 60,
    }
    expect(computeRemainingSeconds({ ordem, now: NOW, min: 0 })).toBe(300)
  })

  it('prioriza tempo_restante_pausado_seg', () => {
    const ordem = { fim_estimado: '2026-06-01T19:39:00.000Z', tempo_restante_pausado_seg: 120 }
    expect(computeRemainingSeconds({ ordem, now: NOW, min: 0 })).toBe(120)
  })

  it('cai no total_duration_minutes quando nao ha fim', () => {
    const ordem = { fim_estimado: null, fim_calculado: null, tempo_restante_pausado_seg: null, total_duration_minutes: 30 }
    expect(computeRemainingSeconds({ ordem, now: NOW, min: 0 })).toBe(1800)
  })

  it('aplica o piso min (retomar usa 60s)', () => {
    const ordem = { fim_estimado: '2026-06-01T19:34:10.000Z', tempo_restante_pausado_seg: null }
    expect(computeRemainingSeconds({ ordem, now: NOW, min: 60 })).toBe(60)
  })
})

describe('operacao — builders nao tocam colunas de agendamento', () => {
  it('iniciar define fim_estimado e inicio_operacao_em, sem inicio_agendado/fim_calculado', () => {
    const ordem = { inicio_operacao_em: null }
    const u = buildIniciarUpdate({ ordem, durationMinutes: 80, now: NOW, operadorId: 'op-1', operadorNome: 'Bento' })
    expect(u.status).toBe('produzindo')
    expect(u.planning_status).toBe('IN_PRODUCTION')
    expect(u.inicio_operacao_em).toBe(NOW.toISOString())
    expect(u.fim_estimado).toBe('2026-06-01T20:54:00.000Z') // +80min
    expect('inicio_agendado' in u).toBe(false)
    expect('fim_calculado' in u).toBe(false)
  })

  it('iniciar preserva inicio_operacao_em ja existente', () => {
    const ordem = { inicio_operacao_em: '2026-06-01T10:00:00.000Z' }
    const u = buildIniciarUpdate({ ordem, durationMinutes: 80, now: NOW, operadorId: 'op-1', operadorNome: 'Bento' })
    expect(u.inicio_operacao_em).toBe('2026-06-01T10:00:00.000Z')
  })

  it('pausar congela com tempo_restante e nao toca fim_calculado', () => {
    const ordem = { fim_estimado: '2026-06-01T19:39:00.000Z', tempo_restante_pausado_seg: null, total_duration_minutes: 60 }
    const u = buildPausarUpdate({ ordem, now: NOW, operadorId: 'op-1', operadorNome: 'Bento', observacaoPausa: 'pausa' })
    expect(u.status).toBe('pausada')
    expect(u.planning_status).toBe('PAUSED')
    expect(u.pausado_em).toBe(NOW.toISOString())
    expect(u.tempo_restante_pausado_seg).toBe(300)
    expect(u.observacao_pausa).toBe('pausa')
    expect('fim_calculado' in u).toBe(false)
  })

  it('retomar empurra fim_estimado pelo tempo restante', () => {
    const ordem = { tempo_restante_pausado_seg: 600, fim_estimado: null }
    const u = buildRetomarUpdate({ ordem, now: NOW, operadorId: 'op-1', operadorNome: 'Bento' })
    expect(u.status).toBe('produzindo')
    expect(u.pausado_em).toBeNull()
    expect(u.tempo_restante_pausado_seg).toBeNull()
    expect(u.fim_estimado).toBe('2026-06-01T19:44:00.000Z') // now + 600s
    expect('fim_calculado' in u).toBe(false)
  })

  it('finalizar registra fim_operacao_em e nao toca fim_calculado', () => {
    const ordem = { inicio_operacao_em: '2026-06-01T19:00:00.000Z' }
    const u = buildFinalizarUpdate({ ordem, now: NOW, operadorId: 'op-1', operadorNome: 'Bento' })
    expect(u.status).toBe('concluida')
    expect(u.planning_status).toBe('COMPLETED')
    expect(u.fim_operacao_em).toBe(NOW.toISOString())
    expect(u.inicio_operacao_em).toBe('2026-06-01T19:00:00.000Z')
    expect('fim_calculado' in u).toBe(false)
  })
})
