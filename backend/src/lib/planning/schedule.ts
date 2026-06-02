export const SCHEDULE_IN_PAST_ERROR =
  'Nao e permitido agendar producao em horario passado. Escolha o horario atual ou futuro.'

function truncateToMinute(date: Date): Date {
  const result = new Date(date)
  result.setSeconds(0, 0)
  return result
}

export function isScheduleStartInPast(startAt: Date, now = new Date()): boolean {
  return startAt.getTime() < truncateToMinute(now).getTime()
}
