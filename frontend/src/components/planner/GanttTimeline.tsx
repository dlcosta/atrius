import {
  JanelaProducao,
  PIXELS_PER_MINUTE,
  obterLarguraGanttPx,
  obterMarcasHora,
} from '@/lib/planning/gantt-layout'

type Props = {
  janela: JanelaProducao
  label?: string
}

export function GanttTimeline({ janela, label = 'Tanque' }: Props) {
  const horas = obterMarcasHora(janela)
  const largura = obterLarguraGanttPx(janela)

  return (
    <div className="flex border-b-2 border-[#E4E7EC] bg-white sticky top-0 z-30 shadow-sm">
      {/* Coluna de label */}
      <div className="w-56 shrink-0 border-r border-[#E4E7EC] px-4 py-3 flex items-center bg-[#F7F8FA]">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{label}</span>
      </div>

      {/* Timeline de horas */}
      <div className="relative overflow-hidden" style={{ width: largura, height: 44 }}>
        {horas.map((h) => (
          <div
            key={h}
            className="absolute top-0 bottom-0 flex items-center border-l border-[#E4E7EC]"
            style={{ left: (h - janela.startHour) * 60 * PIXELS_PER_MINUTE }}
          >
            <span className="ml-2 rounded-[6px] bg-[#F0F2F5] px-2 py-0.5 font-mono text-[12px] font-semibold text-[#4B5563]">
              {String(h).padStart(2, '0')}:00
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
