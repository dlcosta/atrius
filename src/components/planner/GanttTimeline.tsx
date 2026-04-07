import {
  JanelaProducao,
  PIXELS_PER_MINUTE,
  obterLarguraGanttPx,
  obterMarcasHora,
} from '@/lib/planning/gantt-layout'

type Props = {
  janela: JanelaProducao
}

export function GanttTimeline({ janela }: Props) {
  const horas = obterMarcasHora(janela)
  const largura = obterLarguraGanttPx(janela)

  return (
    <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
      <div className="w-36 flex-shrink-0 border-r border-slate-200" />
      <div className="relative overflow-hidden" style={{ width: largura }}>
        {horas.map((h) => (
          <div
            key={h}
            className="absolute top-0 h-9 flex items-center text-xs text-slate-500 border-l border-slate-200"
            style={{ left: (h - janela.startHour) * 60 * PIXELS_PER_MINUTE }}
          >
            <span className="pl-1">{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}
      </div>
    </div>
  )
}
