import { describe, expect, it } from 'vitest'
import {
  calculateLitersFromBoxes,
  calculateEstimatedBoxes,
  calculateProductionEndTime,
  calculateTankVolumeBalance,
  calculateTotalDuration,
  hasScheduleConflict,
  validateTankCapacity,
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
  }
}

describe('planning production helpers', () => {
  it('calcula duracao total', () => {
    expect(calculateTotalDuration({
      setupTimeMinutes: 10,
      productionTimeMinutes: 60,
      cleaningTimeMinutes: 20,
    })).toBe(90)
  })

  it('calcula horario final da producao', () => {
    const fim = calculateProductionEndTime(new Date('2026-05-14T07:30:00.000Z'), 90)
    expect(fim.toISOString()).toBe('2026-05-14T09:00:00.000Z')
  })

  it('calcula 190 caixas para 3800L em caixa de 4x5L', () => {
    const result = calculateEstimatedBoxes({
      liters: 3800,
      packageVolumeLiters: 5,
      unitsPerBox: 4,
    })
    expect(result.boxVolumeLiters).toBe(20)
    expect(result.estimatedBoxes).toBe(190)
  })

  it('calcula litros a partir de caixas', () => {
    expect(calculateLitersFromBoxes({
      boxes: 190,
      packageVolumeLiters: 5,
      unitsPerBox: 4,
    })).toBe(3800)
  })

  it('valida capacidade do tanque', () => {
    expect(validateTankCapacity(3800, 3800)).toBe(true)
    expect(validateTankCapacity(3900, 3800)).toBe(false)
  })

  it('detecta conflito por maquina em envase', () => {
    const existing = [baseOrder({ id: 'A', maquina_id: 'maq-1', etapa: 'envase' })]
    const conflict = hasScheduleConflict({
      productionType: 'FILLING',
      machineId: 'maq-1',
      newStart: new Date('2026-05-14T07:30:00.000Z'),
      newEnd: new Date('2026-05-14T08:30:00.000Z'),
      existingSchedules: existing,
    })
    expect(conflict).toBe(true)
  })

  it('detecta conflito por tanque em producao de tanque', () => {
    const existing = [baseOrder({ id: 'B', etapa: 'tanque', machine_id: null, tank_id: 'tank-3800' })]
    const conflict = hasScheduleConflict({
      productionType: 'TANK',
      tankId: 'tank-3800',
      newStart: new Date('2026-05-14T07:30:00.000Z'),
      newEnd: new Date('2026-05-14T08:30:00.000Z'),
      existingSchedules: existing,
    })
    expect(conflict).toBe(true)
  })

  it('calcula saldo de volume para tanque x envase', () => {
    const balance = calculateTankVolumeBalance({
      tankLiters: 5000,
      alreadyFilledLiters: 3000,
      currentFillingLiters: 1500,
    })
    expect(balance.status).toBe('UNDER')
    expect(balance.deltaLiters).toBe(500)
  })
})
