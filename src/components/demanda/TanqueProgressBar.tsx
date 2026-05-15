'use client'

type Props = {
  litrosSelecionados: number
  capacidadeTanque: number
}

export function TanqueProgressBar({ litrosSelecionados, capacidadeTanque }: Props) {
  const pct = capacidadeTanque > 0
    ? Math.min(100, (litrosSelecionados / capacidadeTanque) * 100)
    : 0

  const cheio = pct >= 100

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${cheio ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${cheio ? 'text-red-600' : 'text-slate-700'}`}>
        {pct.toFixed(0)}% ({litrosSelecionados.toLocaleString('pt-BR')}L / {capacidadeTanque.toLocaleString('pt-BR')}L)
      </span>
    </div>
  )
}
