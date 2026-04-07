'use client'
import type { BlocoGantt, Maquina, Ordem } from '@/types'
import { GanttTimeline } from './GanttTimeline'
import { GanttRow } from './GanttRow'
import { detectarConflito } from '@/lib/planning/engine'

type Props = {
  maquinas: Maquina[]
  blocos: BlocoGantt[]
  ordens: Ordem[]
  dia: Date
  onAgendar: (ordemId: string, maquinaId: string, inicio: Date) => void
  onDesagendar: (ordemId: string) => void
}

export function GanttChart({ maquinas, blocos, ordens, dia, onAgendar, onDesagendar }: Props) {
  // Detect conflicts to highlight blocks in red
  const conflitos = new Set<string>()
  ordens.forEach((ordem) => {
    if (detectarConflito(ordem, ordens)) conflitos.add(ordem.id)
  })

  return (
    <div className="border border-gray-200 rounded overflow-x-auto">
      <GanttTimeline />
      {maquinas.filter((m) => m.ativa).map((maquina) => (
        <GanttRow
          key={maquina.id}
          maquina={maquina}
          blocos={blocos.filter((b) => b.maquinaId === maquina.id)}
          dia={dia}
          conflitos={conflitos}
          onSoltar={onAgendar}
          onRemover={onDesagendar}
        />
      ))}
    </div>
  )
}
