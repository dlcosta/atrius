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
      className={`absolute top-2 bottom-2 rounded-xl flex flex-col justify-center px-4 select-none overflow-hidden shadow-sm transition-all hover:scale-[1.02] hover:z-20 hover:shadow-xl
        ${conflito ? 'ring-4 ring-red-600 z-10 animate-pulse' : ''}
        ${isLimpeza ? 'opacity-90 border-2 border-dashed border-amber-600' : 'border-2 border-black/20'}
        ${isSetup ? 'bg-[length:12px_12px] bg-[linear-gradient(-45deg,rgba(255,255,255,0.3)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.3)_50%,rgba(255,255,255,0.3)_75%,transparent_75%,transparent)]' : ''}
      `}
      style={{
        left,
        width: Math.max(width, 80),
        backgroundColor: bloco.cor,
      }}
      title={`${bloco.produto}\n${bloco.tanque ? `Tanque: ${bloco.tanque}\n` : ''}${formatarHora(bloco.inicio)} - ${formatarHora(bloco.fim)}\n${formatarDuracao(bloco.duracao_min)}`}
    >
      <span className="text-lg font-black text-slate-900 truncate leading-none drop-shadow-md tracking-tighter">
        {bloco.tanque && <span className="text-blue-900 opacity-60 mr-1">[{bloco.tanque.toUpperCase()}]</span>}
        {bloco.produto}
      </span>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs bg-black/10 px-1.5 py-0.5 rounded font-bold text-slate-800">
          {formatarHora(bloco.inicio)}
        </span>
        <span className="text-xs font-black text-slate-900 drop-shadow-sm">
          {formatarDuracao(bloco.duracao_min)}
        </span>
      </div>

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
