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
    <div className="flex border-b-2 border-slate-300 bg-slate-100 sticky top-0 z-30 shadow-md">
      <div className="w-56 flex-shrink-0 border-r-2 border-slate-300 p-2 flex items-center justify-center bg-slate-200/50">
        <span className="text-sm font-black text-slate-600 uppercase tracking-tighter">Máquinas</span>
      </div>

      <div className="relative overflow-hidden" style={{ width: largura, height: 48 }}>
        {horas.map((h) => (
          <div
            key={h}
            className="absolute top-0 bottom-0 flex items-center border-l-2 border-slate-300"
            style={{ left: (h - janela.startHour) * 60 * PIXELS_PER_MINUTE }}
          >
            <span className="text-base font-black text-slate-800 bg-white/90 px-2 py-1 rounded shadow-sm ml-2">
              {String(h).padStart(2, '0')}:00
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
