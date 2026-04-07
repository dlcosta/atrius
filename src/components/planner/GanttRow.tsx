'use client'
import { useRef } from 'react'
import type { BlocoGantt, Maquina } from '@/types'
import { GanttBlock } from './GanttBlock'
import {
  JanelaProducao,
  pixelParaHora,
  ROW_HEIGHT,
  PIXELS_PER_MINUTE,
  obterLarguraGanttPx,
  obterMarcasHora,
} from '@/lib/planning/gantt-layout'

type Props = {
  maquina: Maquina
  blocos: BlocoGantt[]
  dia: Date
  janela: JanelaProducao
  conflitos: Set<string>
  ocupacaoPercentual: number
  onSoltar: (ordemId: string, maquinaId: string, inicio: Date) => void
  onRemover: (ordemId: string) => void
}

export function GanttRow({
  maquina,
  blocos,
  dia,
  janela,
  conflitos,
  ocupacaoPercentual,
  onSoltar,
  onRemover,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const largura = obterLarguraGanttPx(janela)
  const marcas = obterMarcasHora(janela)

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
    const inicio = pixelParaHora(Math.max(0, px), dia, janela)

    const minutos = inicio.getMinutes()
    const snap = janela.snapMinutes || 15
    inicio.setMinutes(Math.round(minutos / snap) * snap, 0, 0)

    onSoltar(ordemId, maquina.id, inicio)
  }

  return (
    <div className="flex border-b border-slate-100">
      <div className="w-36 flex-shrink-0 border-r border-slate-200 px-3 py-2 flex flex-col justify-center gap-1 bg-slate-50">
        <span className="text-xs font-semibold text-slate-700">{maquina.nome}</span>
        <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500"
            style={{ width: `${Math.min(100, Math.max(0, ocupacaoPercentual))}%` }}
          />
        </div>
        <span className="text-[10px] text-slate-500">{ocupacaoPercentual.toFixed(0)}% ocupado</span>
      </div>

      <div
        ref={rowRef}
        className="relative bg-white hover:bg-slate-50/60"
        style={{ width: largura, height: ROW_HEIGHT }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {marcas.map((hora) => (
          <div
            key={hora}
            className="absolute top-0 bottom-0 border-l border-slate-100"
            style={{ left: (hora - janela.startHour) * 60 * PIXELS_PER_MINUTE }}
          />
        ))}

        {blocos.map((bloco) => (
          <GanttBlock
            key={bloco.id}
            bloco={bloco}
            dia={dia}
            janela={janela}
            conflito={conflitos.has(bloco.ordemId)}
            onRemover={bloco.tipo === 'producao' ? onRemover : undefined}
          />
        ))}
      </div>
    </div>
  )
}
