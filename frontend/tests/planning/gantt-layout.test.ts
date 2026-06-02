import { describe, expect, it } from 'vitest'
import {
  sanitizarJanelaProducao,
  obterDuracaoJanelaMinutos,
  obterMarcasHora,
  pixelParaHora,
  horaParaPixel,
  formatarDuracao,
  DEFAULT_JANELA_PRODUCAO,
} from '@/lib/planning/gantt-layout'

describe('gantt-layout — sanitizarJanelaProducao', () => {
  it('mantem uma janela valida', () => {
    expect(sanitizarJanelaProducao({ startHour: 7, endHour: 18, snapMinutes: 15 }))
      .toEqual({ startHour: 7, endHour: 18, snapMinutes: 15 })
  })

  it('corrige endHour <= startHour', () => {
    expect(sanitizarJanelaProducao({ startHour: 10, endHour: 8, snapMinutes: 15 }).endHour).toBe(11)
  })

  it('faz fallback de snap invalido para o padrao', () => {
    expect(sanitizarJanelaProducao({ startHour: 7, endHour: 18, snapMinutes: 7 }).snapMinutes)
      .toBe(DEFAULT_JANELA_PRODUCAO.snapMinutes)
  })

  it('faz clamp das horas para faixas validas', () => {
    const j = sanitizarJanelaProducao({ startHour: -5, endHour: 99, snapMinutes: 30 })
    expect(j.startHour).toBe(0)
    expect(j.endHour).toBe(24)
  })
})

describe('gantt-layout — geometria', () => {
  const janela = DEFAULT_JANELA_PRODUCAO

  it('duracao da janela em minutos', () => {
    expect(obterDuracaoJanelaMinutos(janela)).toBe((18 - 7) * 60)
  })

  it('marcas de hora inclusivas', () => {
    expect(obterMarcasHora({ startHour: 7, endHour: 9, snapMinutes: 15 })).toEqual([7, 8, 9])
  })

  it('pixelParaHora e horaParaPixel sao inversos', () => {
    const dia = new Date(2026, 5, 2)
    const hora = pixelParaHora(180, dia, janela) // 180px / 3 = 60min apos startHour
    expect(horaParaPixel(hora, dia, janela)).toBe(180)
  })
})

describe('gantt-layout — formatarDuracao', () => {
  it('formata combinacoes de horas e minutos', () => {
    expect(formatarDuracao(45)).toBe('45min')
    expect(formatarDuracao(60)).toBe('1h')
    expect(formatarDuracao(80)).toBe('1h 20min')
  })
})
