import type { Ordem } from '@/types'

export const DEFAULT_TANKS = [
  { id: 'tank-3800', name: 'Tanque 3.800L', volumeLiters: 3800 },
  { id: 'tank-5000', name: 'Tanque 5.000L', volumeLiters: 5000 },
  { id: 'tank-10000', name: 'Tanque 10.000L', volumeLiters: 10000 },
] as const

export const DEFAULT_MACHINES = [
  { id: 'maq-1', name: 'MAQ 1' },
  { id: 'maq-2', name: 'MAQ 2' },
  { id: 'maq-3', name: 'MAQ 3' },
] as const

export const VOLUME_BALANCE_TOLERANCE_LITERS = 0.01

export type CalcMode = 'LITERS_MASTER' | 'BOXES_MASTER'

export function calculateTotalDuration({
  setupTimeMinutes,
  productionTimeMinutes,
  cleaningTimeMinutes,
}: {
  setupTimeMinutes: number
  productionTimeMinutes: number
  cleaningTimeMinutes: number
}): number {
  return Number(setupTimeMinutes || 0) + Number(productionTimeMinutes || 0) + Number(cleaningTimeMinutes || 0)
}

export function calculateProductionEndTime(startAt: Date, totalDurationMinutes: number): Date {
  return new Date(startAt.getTime() + totalDurationMinutes * 60000)
}

export function calculateEstimatedBoxes({
  liters,
  packageVolumeLiters,
  unitsPerBox,
}: {
  liters: number
  packageVolumeLiters: number
  unitsPerBox: number
}): { boxVolumeLiters: number; estimatedBoxes: number } {
  const boxVolumeLiters = Number(packageVolumeLiters || 0) * Number(unitsPerBox || 0)
  if (!Number.isFinite(boxVolumeLiters) || boxVolumeLiters <= 0) {
    return { boxVolumeLiters: 0, estimatedBoxes: 0 }
  }

  return {
    boxVolumeLiters,
    estimatedBoxes: Math.floor(Number(liters || 0) / boxVolumeLiters),
  }
}

export function calculateLitersFromBoxes({
  boxes,
  packageVolumeLiters,
  unitsPerBox,
}: {
  boxes: number
  packageVolumeLiters: number
  unitsPerBox: number
}): number {
  const boxVolumeLiters = Number(packageVolumeLiters || 0) * Number(unitsPerBox || 0)
  if (!Number.isFinite(boxVolumeLiters) || boxVolumeLiters <= 0) return 0
  return Number(boxes || 0) * boxVolumeLiters
}

export function validateTankCapacity(liters: number, tankVolumeLiters: number): boolean {
  if (!Number.isFinite(liters) || !Number.isFinite(tankVolumeLiters)) return false
  return liters <= tankVolumeLiters
}

function intervalOverlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart
}

export function hasScheduleConflict({
  ordemId,
  productionType,
  tankId,
  machineId,
  newStart,
  newEnd,
  existingSchedules,
}: {
  ordemId?: string
  productionType: 'TANK' | 'FILLING'
  tankId?: string | null
  machineId?: string | null
  newStart: Date
  newEnd: Date
  existingSchedules: Ordem[]
}): boolean {
  return existingSchedules.some((schedule) => {
    if (ordemId && schedule.id === ordemId) return false
    if (!schedule.inicio_agendado || !schedule.fim_calculado) return false

    if (productionType === 'TANK') {
      if (!tankId || schedule.tank_id !== tankId) return false
    } else {
      if (!machineId || schedule.maquina_id !== machineId) return false
    }

    const existingStart = new Date(schedule.inicio_agendado)
    const existingEnd = new Date(schedule.fim_calculado)
    return intervalOverlaps(newStart, newEnd, existingStart, existingEnd)
  })
}

export function calculateTankVolumeBalance({
  tankLiters,
  alreadyFilledLiters,
  currentFillingLiters,
  tolerance = VOLUME_BALANCE_TOLERANCE_LITERS,
}: {
  tankLiters: number
  alreadyFilledLiters: number
  currentFillingLiters?: number
  tolerance?: number
}) {
  const totalFilledLiters = Number(alreadyFilledLiters || 0) + Number(currentFillingLiters || 0)
  const deltaLiters = Number(tankLiters || 0) - totalFilledLiters
  const absDelta = Math.abs(deltaLiters)

  if (absDelta <= tolerance) {
    return {
      totalFilledLiters,
      deltaLiters: 0,
      status: 'BALANCED' as const,
      warning: null,
    }
  }

  if (deltaLiters > 0) {
    return {
      totalFilledLiters,
      deltaLiters,
      status: 'UNDER' as const,
      warning: `Faltando envasar ${deltaLiters.toFixed(2)} L`,
    }
  }

  return {
    totalFilledLiters,
    deltaLiters,
    status: 'OVER' as const,
    warning: `Excedendo ${Math.abs(deltaLiters).toFixed(2)} L do tanque`,
  }
}
