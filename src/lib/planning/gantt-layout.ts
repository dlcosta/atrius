export const PIXELS_PER_MINUTE = 2
export const ROW_HEIGHT = 72

export type JanelaProducao = {
  startHour: number
  endHour: number
  snapMinutes: number
}

export const DEFAULT_JANELA_PRODUCAO: JanelaProducao = {
  startHour: 7,
  endHour: 18,
  snapMinutes: 15,
}

function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor))
}

export function sanitizarJanelaProducao(janela: Partial<JanelaProducao>): JanelaProducao {
  const startHour = clamp(Math.floor(janela.startHour ?? DEFAULT_JANELA_PRODUCAO.startHour), 0, 23)
  let endHour = clamp(Math.floor(janela.endHour ?? DEFAULT_JANELA_PRODUCAO.endHour), 1, 24)

  if (endHour <= startHour) {
    endHour = Math.min(24, startHour + 1)
  }

  const snapCandidates = [5, 10, 15, 30, 60]
  const snapMinutes = snapCandidates.includes(Number(janela.snapMinutes))
    ? Number(janela.snapMinutes)
    : DEFAULT_JANELA_PRODUCAO.snapMinutes

  return { startHour, endHour, snapMinutes }
}

export function obterDuracaoJanelaMinutos(janela: JanelaProducao): number {
  return Math.max(60, (janela.endHour - janela.startHour) * 60)
}

export function obterLarguraGanttPx(janela: JanelaProducao): number {
  return obterDuracaoJanelaMinutos(janela) * PIXELS_PER_MINUTE
}

export function obterMarcasHora(janela: JanelaProducao): number[] {
  const horas: number[] = []
  for (let h = janela.startHour; h <= janela.endHour; h++) {
    horas.push(h)
  }
  return horas
}

/** Converts pixel X position to a Date (given the selected day) */
export function pixelParaHora(px: number, dia: Date, janela: JanelaProducao): Date {
  const minutos = Math.round(px / PIXELS_PER_MINUTE)
  const resultado = new Date(dia)
  resultado.setHours(janela.startHour, 0, 0, 0)
  resultado.setMinutes(resultado.getMinutes() + minutos)
  return resultado
}

/** Converts a Date to pixel X position */
export function horaParaPixel(hora: Date, dia: Date, janela: JanelaProducao): number {
  const inicio = new Date(dia)
  inicio.setHours(janela.startHour, 0, 0, 0)
  const minutos = (hora.getTime() - inicio.getTime()) / 60000
  return Math.max(0, minutos * PIXELS_PER_MINUTE)
}

/** Formats minutes as "Xh Ymin" */
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = Math.round(minutos % 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

/** Formats a Date as "HH:MM" */
export function formatarHora(data: Date): string {
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
