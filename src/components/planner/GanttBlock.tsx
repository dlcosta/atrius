import type { BlocoGantt } from '@/types'
import { horaParaPixel, formatarDuracao, formatarHora, PIXELS_PER_MINUTE } from '@/lib/planning/gantt-layout'

type Props = {
  bloco: BlocoGantt
  dia: Date
  conflito?: boolean
  onRemover?: (ordemId: string) => void
}

export function GanttBlock({ bloco, dia, conflito, onRemover }: Props) {
  const left = horaParaPixel(bloco.inicio, dia)
  const width = bloco.duracao_min * PIXELS_PER_MINUTE
  const isLimpeza = bloco.tipo === 'limpeza'

  return (
    <div
      className={`absolute top-1 bottom-1 rounded flex flex-col justify-center px-2 select-none
        ${conflito ? 'ring-2 ring-red-500' : ''}
        ${isLimpeza ? 'opacity-70 border border-dashed border-yellow-400' : 'border border-black/10'}
      `}
      style={{
        left,
        width: Math.max(width, 40),
        backgroundColor: bloco.cor,
      }}
      title={`${bloco.produto}\n${formatarHora(bloco.inicio)} – ${formatarHora(bloco.fim)}\n${formatarDuracao(bloco.duracao_min)}`}
    >
      <span className="text-xs font-semibold text-gray-800 truncate leading-tight">
        {bloco.produto}
      </span>
      <span className="text-[10px] text-gray-600 leading-tight">
        {formatarHora(bloco.inicio)} · {formatarDuracao(bloco.duracao_min)}
      </span>
      {!isLimpeza && onRemover && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemover(bloco.ordemId) }}
          className="absolute top-0.5 right-0.5 text-gray-600 hover:text-red-600 text-xs leading-none"
          title="Remover do Gantt"
        >
          ×
        </button>
      )}
    </div>
  )
}
