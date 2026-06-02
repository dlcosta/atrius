import type { BlocoGantt } from '@/types'
import {
  JanelaProducao,
  horaParaPixel,
  formatarDuracao,
  formatarHora,
  PIXELS_PER_MINUTE,
} from '@/lib/planning/gantt-layout'
import { X } from 'lucide-react'

type Props = {
  bloco: BlocoGantt
  dia: Date
  janela: JanelaProducao
  conflito?: boolean
  aguardandoTanque?: boolean
  onRemover?: (ordemId: string) => void
}

const TIPO_CONFIG = {
  producao: {
    label: 'Produção',
    textClass: 'text-slate-900',
    borderClass: 'border-black/15',
    badgeClass: 'bg-black/10 text-slate-800',
    stripedBg: false,
  },
  setup: {
    label: 'Preparação',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-400/40',
    badgeClass: 'bg-white/40 text-slate-700',
    stripedBg: true,
  },
  limpeza: {
    label: 'Preparação',
    textClass: 'text-amber-900',
    borderClass: 'border-amber-600',
    badgeClass: 'bg-amber-100 text-amber-800',
    stripedBg: false,
  },
}

export function GanttBlock({ bloco, dia, janela, conflito, aguardandoTanque, onRemover }: Props) {
  const left = horaParaPixel(bloco.inicio, dia, janela)
  const width = bloco.duracao_min * PIXELS_PER_MINUTE
  const config = TIPO_CONFIG[bloco.tipo]
  const isLimpeza = bloco.tipo === 'limpeza'
  const isSetup = bloco.tipo === 'setup'
  const isProducao = bloco.tipo === 'producao'

  const tooltip = [
    bloco.produto,
    bloco.tanque ? `Tanque: ${bloco.tanque}` : '',
    `${formatarHora(bloco.inicio)} → ${formatarHora(bloco.fim)}`,
    `Duração: ${formatarDuracao(bloco.duracao_min)}`,
    conflito ? '⚠ CONFLITO DE HORÁRIO' : '',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      className={`group absolute top-2 bottom-2 flex flex-col justify-between overflow-hidden rounded-xl px-3 py-2 select-none shadow-sm transition-all duration-150
        hover:z-20 hover:shadow-lg hover:scale-[1.01]
        ${conflito ? 'ring-4 ring-red-500 z-10 animate-pulse' : ''}
        ${isLimpeza ? 'border-2 border-dashed border-amber-500 opacity-90' : `border-2 ${config.borderClass}`}
        ${isSetup ? 'bg-[length:10px_10px] bg-[repeating-linear-gradient(-45deg,rgba(255,255,255,0.25)_0,rgba(255,255,255,0.25)_1px,transparent_0,transparent_50%)]' : ''}
      `}
      style={{
        left,
        width: Math.max(width, 72),
        backgroundColor: isLimpeza ? '#FDE68A' : isSetup ? '#E5E7EB' : bloco.cor,
      }}
      title={tooltip}
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {bloco.tanque && isProducao && (
            <div className="mb-0.5 truncate text-[10px] font-bold uppercase tracking-wider opacity-60">
              [{bloco.tanque.toUpperCase()}]
            </div>
          )}
          <div className={`truncate text-[13px] font-black leading-tight tracking-tight drop-shadow-sm ${config.textClass}`}>
            {bloco.produto}
          </div>
        </div>

        {isProducao && onRemover && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemover(bloco.ordemId)
            }}
            className="invisible ml-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-black/10 bg-white/60 text-slate-600 transition hover:bg-red-50 hover:text-red-600 group-hover:visible"
            title="Remover do calendário"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* Rodapé com horário + duração */}
      <div className="mt-auto flex items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${config.badgeClass}`}>
          {formatarHora(bloco.inicio)}
        </span>
        <span className={`text-[10px] font-semibold opacity-70 ${config.textClass}`}>
          {formatarDuracao(bloco.duracao_min)}
        </span>
        {conflito && (
          <span className="ml-auto rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
            CONFLITO
          </span>
        )}
        {!conflito && aguardandoTanque && isProducao && (
          <span className="ml-auto rounded-full bg-purple-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
            AG. TANQUE
          </span>
        )}
        {!conflito && !aguardandoTanque && (
          <span className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase opacity-50 ${config.textClass}`}>
            {config.label}
          </span>
        )}
      </div>
    </div>
  )
}
