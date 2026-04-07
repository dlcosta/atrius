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
    <div className="flex border-b border-slate-200">
      <div className="w-56 flex-shrink-0 border-r border-slate-300 px-4 py-3 flex flex-col justify-center gap-2 bg-slate-50/80 sticky left-0 z-10 shadow-sm">
        <span className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none">{maquina.nome}</span>
        <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
          <div
            className="h-full rounded-full bg-blue-600 shadow-xs"
            style={{ width: `${Math.min(100, Math.max(0, ocupacaoPercentual))}%` }}
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-slate-600 uppercase">{ocupacaoPercentual.toFixed(0)}% ocupado</span>
          <div className={`w-3 h-3 rounded-full ${ocupacaoPercentual > 90 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
        </div>
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
