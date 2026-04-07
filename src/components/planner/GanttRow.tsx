'use client'
import { useRef } from 'react'
import type { BlocoGantt, Maquina } from '@/types'
import { GanttBlock } from './GanttBlock'
import { pixelParaHora, GANTT_WIDTH, ROW_HEIGHT, PIXELS_PER_MINUTE } from '@/lib/planning/gantt-layout'

type Props = {
  maquina: Maquina
  blocos: BlocoGantt[]
  dia: Date
  conflitos: Set<string>
  onSoltar: (ordemId: string, maquinaId: string, inicio: Date) => void
  onRemover: (ordemId: string) => void
}

export function GanttRow({ maquina, blocos, dia, conflitos, onSoltar, onRemover }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const ordemId = e.dataTransfer.getData('ordemId')
    if (!ordemId || !rowRef.current) return

    const rect = rowRef.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const inicio = pixelParaHora(Math.max(0, px), dia)
    // Round to 15-minute intervals
    const minutos = inicio.getMinutes()
    inicio.setMinutes(Math.round(minutos / 15) * 15, 0, 0)

    onSoltar(ordemId, maquina.id, inicio)
  }

  return (
    <div className="flex border-b border-gray-100">
      {/* Machine label */}
      <div className="w-24 flex-shrink-0 border-r border-gray-200 flex items-center px-3">
        <span className="text-xs font-semibold text-gray-600">{maquina.nome}</span>
      </div>

      {/* Gantt area for this machine */}
      <div
        ref={rowRef}
        className="relative bg-white hover:bg-gray-50/50"
        style={{ width: GANTT_WIDTH, height: ROW_HEIGHT }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Hour grid lines */}
        {Array.from({ length: 11 }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-l border-gray-100"
            style={{ left: i * 60 * PIXELS_PER_MINUTE }}
          />
        ))}

        {/* Blocks */}
        {blocos.map((bloco) => (
          <GanttBlock
            key={bloco.id}
            bloco={bloco}
            dia={dia}
            conflito={conflitos.has(bloco.ordemId)}
            onRemover={bloco.tipo === 'producao' ? onRemover : undefined}
          />
        ))}
      </div>
    </div>
  )
}
