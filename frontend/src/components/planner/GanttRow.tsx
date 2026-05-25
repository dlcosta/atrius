'use client'
import { useRef } from 'react'
import type { BlocoGantt, Maquina, Tanque } from '@/types'
import { GanttBlock } from './GanttBlock'
import {
  JanelaProducao,
  pixelParaHora,
  ROW_HEIGHT,
  PIXELS_PER_MINUTE,
  obterLarguraGanttPx,
  obterMarcasHora,
} from '@/lib/planning/gantt-layout'
import { Droplets } from 'lucide-react'

type Props = {
  maquina: Maquina
  tanque?: Tanque | null
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
  tanque,
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

  const capacidade = tanque?.volume_liters ?? null
  const nivelCor =
    ocupacaoPercentual > 90 ? '#EF4444' : ocupacaoPercentual > 70 ? '#F59E0B' : '#2563EB'

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

    const snap = janela.snapMinutes || 15
    inicio.setMinutes(Math.round(inicio.getMinutes() / snap) * snap, 0, 0)

    onSoltar(ordemId, maquina.id, inicio)
  }

  return (
    <div className="flex border-b border-[#E4E7EC] last:border-b-0">
      {/* Coluna de identificação do tanque/máquina */}
      <div className="w-56 shrink-0 border-r border-[#E4E7EC] bg-[#F7F8FA] px-4 py-3 flex flex-col justify-center gap-2 sticky left-0 z-10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-[#111827] leading-none truncate">
            {tanque?.nome ?? maquina.nome}
          </span>
          {capacidade && (
            <div className="flex items-center gap-1 text-[11px] text-[#9CA3AF]">
              <Droplets size={11} className="text-[#2563EB]" />
              <span className="font-mono">{capacidade.toLocaleString('pt-BR')}L</span>
            </div>
          )}
        </div>

        {/* Barra de ocupação */}
        <div className="w-full h-2 rounded-full bg-[#E4E7EC] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(100, Math.max(0, ocupacaoPercentual))}%`,
              backgroundColor: nivelCor,
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase text-[#9CA3AF]">
            {ocupacaoPercentual.toFixed(0)}% ocupado
          </span>
          <div
            className={`h-2 w-2 rounded-full ${
              ocupacaoPercentual > 90 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
            }`}
          />
        </div>
      </div>

      {/* Área do Gantt */}
      <div
        ref={rowRef}
        className="relative bg-white hover:bg-[#FAFBFC] transition-colors"
        style={{ width: largura, height: ROW_HEIGHT }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Linhas de hora */}
        {marcas.map((hora) => (
          <div
            key={hora}
            className={`absolute top-0 bottom-0 border-l ${
              hora === janela.startHour ? 'border-[#CDD2DA]' : 'border-[#F0F2F5]'
            }`}
            style={{ left: (hora - janela.startHour) * 60 * PIXELS_PER_MINUTE }}
          />
        ))}

        {/* Blocos de produção */}
        {blocos.map((bloco) => (
          <GanttBlock
            key={bloco.id}
            bloco={bloco}
            dia={dia}
            janela={janela}
            conflito={conflitos.has(bloco.ordemId)}
            aguardandoTanque={bloco.planning_status === 'WAITING_TANK'}
            onRemover={bloco.tipo === 'producao' ? onRemover : undefined}
          />
        ))}
      </div>
    </div>
  )
}
