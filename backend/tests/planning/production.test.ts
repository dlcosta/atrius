import { describe, expect, it } from 'vitest'
import {
  calculateLitersFromBoxes,
  calculateEstimatedBoxes,
  calculateProductionEndTime,
  calculateTankVolumeBalance,
  calculateTotalDuration,
  hasScheduleConflict,
  validateTankCapacity,
  VOLUME_BALANCE_TOLERANCE_LITERS,
} from '@/lib/planning/production'
import type { Ordem } from '@/types'

function baseOrder(partial: Partial<Ordem>): Ordem {
  return {
    id: partial.id ?? '1',
    numero_externo: partial.numero_externo ?? 'MAN-1',
    produto_sku: partial.produto_sku ?? 'SKU-1',
    maquina_id: partial.maquina_id ?? 'maq-1',
    quantidade: partial.quantidade ?? 3800,
    unidade: partial.unidade ?? 'L',
    tanque: partial.tanque ?? null,
    lote: partial.lote ?? null,
    etapa: partial.etapa ?? 'envase',
    data_prevista: partial.data_prevista ?? '2026-05-14',
    inicio_agendado: partial.inicio_agendado ?? '2026-05-14T07:00:00.000Z',
    fim_calculado: partial.fim_calculado ?? '2026-05-14T08:00:00.000Z',
    status: partial.status ?? 'aguardando',
    sincronizado_em: partial.sincronizado_em ?? '2026-05-14T00:00:00.000Z',
    tank_id: partial.tank_id ?? null,
  } as Ordem
}

describe('production — duracao e caixas', () => {
  it('soma setup + producao + limpeza', () => {
    expect(calculateTotalDuration({ setupTimeMinutes: 10, productionTimeMinutes: 60, cleaningTimeMinutes: 20 })).toBe(90)
  })

  it('trata componentes nulos como zero', () => {
    expect(calculateTotalDuration({ setupTimeMinutes: 0, productionTimeMinutes: 30, cleaningTimeMinutes: 0 })).toBe(30)
  })

  it('calcula fim somando duracao ao inicio', () => {
    expect(calculateProductionEndTime(new Date('2026-05-14T07:30:00.000Z'), 90).toISOString())
      .toBe('2026-05-14T09:00:00.000Z')
  })

  it('caixas a partir de litros (190 caixas de 4x5L = 3800L)', () => {
    const r = calculateEstimatedBoxes({ liters: 3800, packageVolumeLiters: 5, unitsPerBox: 4 })
    expect(r.boxVolumeLiters).toBe(20)
    expect(r.estimatedBoxes).toBe(190)
  })

  it('retorna zero quando volume da caixa e invalido', () => {
    expect(calculateEstimatedBoxes({ liters: 3800, packageVolumeLiters: 0, unitsPerBox: 4 }).estimatedBoxes).toBe(0)
  })

  it('litros a partir de caixas (inverso)', () => {
    expect(calculateLitersFromBoxes({ boxes: 190, packageVolumeLiters: 5, unitsPerBox: 4 })).toBe(3800)
  })
})

describe('production — capacidade de tanque', () => {
  it('aceita volume igual a capacidade e rejeita acima', () => {
    expect(validateTankCapacity(3800, 3800)).toBe(true)
    expect(validateTankCapacity(3900, 3800)).toBe(false)
  })

  it('rejeita valores nao finitos', () => {
    expect(validateTankCapacity(Number.NaN, 3800)).toBe(false)
  })
})

describe('production — saldo de volume (tolerancia)', () => {
  it('classifica UNDER quando falta envasar', () => {
    const b = calculateTankVolumeBalance({ tankLiters: 5000, alreadyFilledLiters: 3000, currentFillingLiters: 1500 })
    expect(b.status).toBe('UNDER')
    expect(b.deltaLiters).toBe(500)
  })

  it('classifica BALANCED dentro da tolerancia', () => {
    const b = calculateTankVolumeBalance({
      tankLiters: 1000,
      alreadyFilledLiters: 1000 - VOLUME_BALANCE_TOLERANCE_LITERS / 2,
    })
    expect(b.status).toBe('BALANCED')
  })

  it('classifica OVER quando passa do volume do tanque', () => {
    const b = calculateTankVolumeBalance({ tankLiters: 1000, alreadyFilledLiters: 900, currentFillingLiters: 200 })
    expect(b.status).toBe('OVER')
  })
})

describe('production — conflito de agenda', () => {
  it('detecta conflito por maquina (envase)', () => {
    const existing = [baseOrder({ id: 'A', maquina_id: 'maq-1', etapa: 'envase' })]
    expect(hasScheduleConflict({
      productionType: 'FILLING', machineId: 'maq-1',
      newStart: new Date('2026-05-14T07:30:00.000Z'), newEnd: new Date('2026-05-14T08:30:00.000Z'),
      existingSchedules: existing,
    })).toBe(true)
  })

  it('nao conflita em maquinas diferentes', () => {
    const existing = [baseOrder({ id: 'A', maquina_id: 'maq-2', etapa: 'envase' })]
    expect(hasScheduleConflict({
      productionType: 'FILLING', machineId: 'maq-1',
      newStart: new Date('2026-05-14T07:30:00.000Z'), newEnd: new Date('2026-05-14T08:30:00.000Z'),
      existingSchedules: existing,
    })).toBe(false)
  })

  it('intervalos que so encostam (fim == inicio) nao conflitam', () => {
    const existing = [baseOrder({
      id: 'A', maquina_id: 'maq-1', etapa: 'envase',
      inicio_agendado: '2026-05-14T08:00:00.000Z', fim_calculado: '2026-05-14T09:00:00.000Z',
    })]
    expect(hasScheduleConflict({
      productionType: 'FILLING', machineId: 'maq-1',
      newStart: new Date('2026-05-14T07:00:00.000Z'), newEnd: new Date('2026-05-14T08:00:00.000Z'),
      existingSchedules: existing,
    })).toBe(false)
  })

  it('detecta conflito por tanque (producao de tanque)', () => {
    const existing = [baseOrder({ id: 'B', etapa: 'tanque', maquina_id: null, tank_id: 'tank-1' })]
    expect(hasScheduleConflict({
      productionType: 'TANK', tankId: 'tank-1',
      newStart: new Date('2026-05-14T07:30:00.000Z'), newEnd: new Date('2026-05-14T08:30:00.000Z'),
      existingSchedules: existing,
    })).toBe(true)
  })
})
