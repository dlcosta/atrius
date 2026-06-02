import { describe, expect, it } from 'vitest'
import { isScheduleStartInPast, validateScheduleStart, SCHEDULE_IN_PAST_ERROR } from '@/lib/planning/schedule'

const NOW = new Date('2026-06-01T12:00:30.500Z')

describe('schedule (frontend)', () => {
  it('isScheduleStartInPast trunca os segundos do agora', () => {
    expect(isScheduleStartInPast(new Date('2026-06-01T12:00:00.000Z'), NOW)).toBe(false)
    expect(isScheduleStartInPast(new Date('2026-06-01T11:59:59.000Z'), NOW)).toBe(true)
  })

  it('validateScheduleStart retorna erro para data inválida', () => {
    expect(validateScheduleStart(new Date('data-invalida'), NOW)).toMatch(/inválido/)
  })

  it('validateScheduleStart retorna erro de passado', () => {
    expect(validateScheduleStart(new Date('2026-06-01T10:00:00.000Z'), NOW)).toBe(SCHEDULE_IN_PAST_ERROR)
  })

  it('validateScheduleStart aceita futuro (null)', () => {
    expect(validateScheduleStart(new Date('2026-06-01T13:00:00.000Z'), NOW)).toBeNull()
  })
})
