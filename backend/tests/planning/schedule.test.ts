import { describe, expect, it } from 'vitest'
import { isScheduleStartInPast } from '@/lib/planning/schedule'

const NOW = new Date('2026-06-01T12:00:30.500Z')

describe('schedule — isScheduleStartInPast', () => {
  it('passado: antes do minuto atual truncado', () => {
    expect(isScheduleStartInPast(new Date('2026-06-01T11:59:00.000Z'), NOW)).toBe(true)
  })

  it('limite: exatamente no minuto atual (segundos truncados) NAO e passado', () => {
    expect(isScheduleStartInPast(new Date('2026-06-01T12:00:00.000Z'), NOW)).toBe(false)
  })

  it('futuro nao e passado', () => {
    expect(isScheduleStartInPast(new Date('2026-06-01T12:01:00.000Z'), NOW)).toBe(false)
  })
})
