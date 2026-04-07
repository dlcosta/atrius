import { GANTT_START_HOUR, GANTT_END_HOUR, PIXELS_PER_MINUTE, GANTT_WIDTH } from '@/lib/planning/gantt-layout'

export function GanttTimeline() {
  const horas = Array.from(
    { length: GANTT_END_HOUR - GANTT_START_HOUR + 1 },
    (_, i) => GANTT_START_HOUR + i
  )

  return (
    <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
      {/* Label column for machine names */}
      <div className="w-24 flex-shrink-0 border-r border-gray-200" />
      <div className="relative overflow-hidden" style={{ width: GANTT_WIDTH }}>
        {horas.map((h) => (
          <div
            key={h}
            className="absolute top-0 h-8 flex items-center text-xs text-gray-500 border-l border-gray-200"
            style={{ left: (h - GANTT_START_HOUR) * 60 * PIXELS_PER_MINUTE }}
          >
            <span className="pl-1">{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}
      </div>
    </div>
  )
}
