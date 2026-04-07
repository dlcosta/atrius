import type { BlocoGantt } from '@/types'
import {
  JanelaProducao,
  horaParaPixel,
  formatarDuracao,
  formatarHora,
  PIXELS_PER_MINUTE,
} from '@/lib/planning/gantt-layout'

type Props = {
  bloco: BlocoGantt
  dia: Date
  janela: JanelaProducao
  conflito?: boolean
  onRemover?: (ordemId: string) => void
}

export function GanttBlock({ bloco, dia, janela, conflito, onRemover }: Props) {
  const left = horaParaPixel(bloco.inicio, dia, janela)
  const width = bloco.duracao_min * PIXELS_PER_MINUTE
  const isLimpeza = bloco.tipo === 'limpeza'
  const isSetup = bloco.tipo === 'setup'

  return (
    <div
      className={`absolute top-1 bottom-1 rounded-lg flex flex-col justify-center px-2 select-none overflow-hidden
        ${conflito ? 'ring-2 ring-red-500 z-10' : ''}
        ${isLimpeza ? 'opacity-80 border border-dashed border-amber-500' : 'border border-black/10'}
        ${isSetup ? 'bg-[length:8px_8px] bg-[linear-gradient(-45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)]' : ''}
      `}
      style={{
        left,
        width: Math.max(width, 44),
        backgroundColor: bloco.cor,
      }}
      title={`${bloco.produto}\n${bloco.tanque ? `Tanque: ${bloco.tanque}\n` : ''}${formatarHora(bloco.inicio)} - ${formatarHora(bloco.fim)}\n${formatarDuracao(bloco.duracao_min)}`}
    >
      <span className="text-xs font-semibold text-slate-800 truncate leading-tight drop-shadow-sm">
        {bloco.tanque && <span className="font-bold mr-1">[{bloco.tanque.toUpperCase()}]</span>}
        {bloco.produto}
      </span>
      <span className="text-[10px] text-slate-700 font-medium leading-tight">
        {formatarHora(bloco.inicio)} - {formatarDuracao(bloco.duracao_min)}
      </span>

      {!isLimpeza && !isSetup && onRemover && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemover(bloco.ordemId)
          }}
          className="absolute top-0.5 right-0.5 text-slate-600 hover:text-red-600 text-xs leading-none"
          title="Remover do gantt"
        >
          x
        </button>
      )}
    </div>
  )
}
