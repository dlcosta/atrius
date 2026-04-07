export const GANTT_START_HOUR = 7       // 07:00
export const GANTT_END_HOUR = 18        // 18:00
export const GANTT_MINUTES = (GANTT_END_HOUR - GANTT_START_HOUR) * 60  // 660
export const PIXELS_PER_MINUTE = 2      // 1 min = 2px → total: 1320px
export const GANTT_WIDTH = GANTT_MINUTES * PIXELS_PER_MINUTE  // 1320px
export const ROW_HEIGHT = 72            // px per machine row

/** Converts pixel X position to a Date (given the selected day) */
export function pixelParaHora(px: number, dia: Date): Date {
  const minutos = Math.round(px / PIXELS_PER_MINUTE)
  const resultado = new Date(dia)
  resultado.setHours(GANTT_START_HOUR, 0, 0, 0)
  resultado.setMinutes(resultado.getMinutes() + minutos)
  return resultado
}

/** Converts a Date to pixel X position */
export function horaParaPixel(hora: Date, dia: Date): number {
  const inicio = new Date(dia)
  inicio.setHours(GANTT_START_HOUR, 0, 0, 0)
  const minutos = (hora.getTime() - inicio.getTime()) / 60000
  return Math.max(0, minutos * PIXELS_PER_MINUTE)
}

/** Formats minutes as "Xh Ymin" */
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

/** Formats a Date as "HH:MM" */
export function formatarHora(data: Date): string {
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
