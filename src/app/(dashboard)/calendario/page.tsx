'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { addDays, endOfWeek, format, startOfWeek, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Maximize2,
  Package,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { Maquina, Ordem, Produto, Tanque } from '@/types'
import { NovaOrdemForm } from '@/components/planner/NovaOrdemForm'
import { calcularDuracao, calcularFim, detectarConflito } from '@/lib/planning/engine'
import {
  DEFAULT_JANELA_PRODUCAO,
  JanelaProducao,
  formatarDuracao,
  formatarHora,
  sanitizarJanelaProducao,
} from '@/lib/planning/gantt-layout'

type ViewMode = 'semana' | 'dia'
type DragPayload =
  | { type: 'backlog'; ordemId: string }
  | { type: 'scheduled'; ordemId: string }

type CalendarEditMode = 'move' | 'resize-start' | 'resize-end'

type PendingDrop = {
  ordemId: string
  maquinaId: string
  inicio: Date
  fim?: Date
  conflito?: Ordem | null
  error?: string
}

const VIEW_STORAGE_KEY = 'atrius:calendario:view'
const MACHINE_STORAGE_KEY = 'atrius:calendario:maquina'
const TAB_STORAGE_KEY = 'atrius:calendario:tab'
const JANELA_STORAGE_KEY = 'atrius:planner:janela-producao'
const SNAP_OPTIONS = [5, 15, 30, 60]
const ZOOM_OPTIONS = [
  { id: 'compacto', label: 'Compacto', pxPerMinuteDay: 2.1, pxPerMinuteWeek: 0.42 },
  { id: 'medio', label: 'Medio', pxPerMinuteDay: 3, pxPerMinuteWeek: 0.6 },
  { id: 'amplo', label: 'Amplo', pxPerMinuteDay: 4.2, pxPerMinuteWeek: 0.84 },
]

function formatYmd(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function dateAtStartOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function horaParaInput(hora: number): string {
  return `${String(hora).padStart(2, '0')}:00`
}

function inputParaHora(valor: string, fallback: number): number {
  const hora = Number(valor.split(':')[0])
  return Number.isFinite(hora) ? hora : fallback
}

function normalizarBusca(valor: string): string {
  return valor.trim().toLowerCase()
}

function ordemPlanningStatus(ordem: Ordem): string {
  if (ordem.planning_status) return ordem.planning_status
  if (ordem.status === 'cancelada') return 'CANCELED'
  if (ordem.status === 'concluida') return 'COMPLETED'
  if (ordem.status === 'produzindo' || ordem.status === 'limpeza') return 'IN_PRODUCTION'
  if (ordem.inicio_agendado) return 'SCHEDULED'
  return 'BACKLOG'
}

function ordemLabel(ordem?: Ordem | null): string {
  if (!ordem) return 'Ordem'
  return ordem.produto?.nome ?? ordem.produto_sku ?? ordem.numero_externo
}

function getInicioFimVisivel(base: Date, viewMode: ViewMode): { inicio: Date; fim: Date; dias: Date[] } {
  if (viewMode === 'dia') {
    const inicio = dateAtStartOfDay(base)
    return { inicio, fim: inicio, dias: [inicio] }
  }

  const inicio = startOfWeek(base, { weekStartsOn: 1 })
  const fim = endOfWeek(base, { weekStartsOn: 1 })
  const dias = Array.from({ length: 7 }, (_, index) => addDays(inicio, index))
  return { inicio, fim: dateAtStartOfDay(fim), dias }
}

function getOrdemDurationMin(ordem: Ordem, maquinaId: string): number {
  if (ordem.inicio_agendado && ordem.fim_calculado) {
    const duration = (new Date(ordem.fim_calculado).getTime() - new Date(ordem.inicio_agendado).getTime()) / 60000
    if (Number.isFinite(duration) && duration > 0) return duration
  }

  const produto = ordem.produto
  if (!produto) return 60

  const tempos = produto.tempos_maquinas?.[maquinaId] ?? { setup: 0, producao: 60 }
  return Math.max(
    15,
    calcularDuracao(
      Number(ordem.quantidade_referencia_litros ?? ordem.quantidade ?? 0),
      Number(produto.volume_base ?? 3800),
      Number(tempos.setup ?? 0),
      Number(tempos.producao ?? 60)
    )
  )
}

function snapDate(date: Date, snapMinutes: number): Date {
  const result = new Date(date)
  const minutes = result.getMinutes()
  result.setMinutes(Math.round(minutes / snapMinutes) * snapMinutes, 0, 0)
  return result
}

function dateToPosition(date: Date, rangeStart: Date, janela: JanelaProducao, dayWidth: number, pxPerMinute: number): number {
  const d = dateAtStartOfDay(date)
  const dayOffset = Math.round((d.getTime() - rangeStart.getTime()) / 86400000)
  const start = new Date(date)
  const minutosDia = (start.getHours() - janela.startHour) * 60 + start.getMinutes()
  return dayOffset * dayWidth + Math.max(0, minutosDia) * pxPerMinute
}

function positionToDate(px: number, rangeStart: Date, janela: JanelaProducao, dayWidth: number, pxPerMinute: number): Date {
  const dayOffset = Math.max(0, Math.floor(px / dayWidth))
  const pxInDay = Math.max(0, px - dayOffset * dayWidth)
  const minutes = Math.round(pxInDay / pxPerMinute)
  const result = addDays(rangeStart, dayOffset)
  result.setHours(janela.startHour, 0, 0, 0)
  result.setMinutes(result.getMinutes() + minutes)
  return result
}

function encontrarConflito(ordens: Ordem[], ordem: Ordem, maquinaId: string, inicio: Date): Ordem | null {
  const duration = getOrdemDurationMin(ordem, maquinaId)
  const candidata: Ordem = {
    ...ordem,
    maquina_id: maquinaId,
    inicio_agendado: inicio.toISOString(),
    fim_calculado: calcularFim(inicio, duration).toISOString(),
  }

  return ordens.find((existente) => {
    if (existente.id === ordem.id) return false
    return detectarConflito(candidata, [existente])
  }) ?? null
}

function isOrdemNaJanela(ordem: Ordem, inicioYmd: string, fimYmd: string): boolean {
  if (!ordem.inicio_agendado) {
    return !ordem.data_prevista || (ordem.data_prevista >= inicioYmd && ordem.data_prevista <= fimYmd)
  }

  const agendada = formatYmd(new Date(ordem.inicio_agendado))
  return agendada >= inicioYmd && agendada <= fimYmd
}

function ordenarAgendaMaquina(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    const aMs = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bMs = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    return aMs - bMs
  })
}

function calcularOcupacaoMaquina(ordens: Ordem[], janela: JanelaProducao, dias: Date[]): number {
  const disponivelMin = Math.max(1, (janela.endHour - janela.startHour) * 60 * Math.max(1, dias.length))
  const ocupadoMin = ordens.reduce((total, ordem) => {
    if (!ordem.inicio_agendado || !ordem.fim_calculado) return total
    const duration = (new Date(ordem.fim_calculado).getTime() - new Date(ordem.inicio_agendado).getTime()) / 60000
    return total + (Number.isFinite(duration) && duration > 0 ? duration : 0)
  }, 0)
  return Math.min(100, Math.max(0, (ocupadoMin / disponivelMin) * 100))
}

function minutesFromWindowStart(date: Date, janela: JanelaProducao): number {
  return (date.getHours() - janela.startHour) * 60 + date.getMinutes()
}

function positionToCalendarDate(
  x: number,
  y: number,
  rangeStart: Date,
  janela: JanelaProducao,
  columnWidth: number,
  pxPerMinute: number,
  totalDays: number
): Date {
  const dayOffset = Math.min(totalDays - 1, Math.max(0, Math.floor(x / columnWidth)))
  const minutes = Math.max(0, Math.round(y / pxPerMinute))
  const result = addDays(rangeStart, dayOffset)
  result.setHours(janela.startHour, 0, 0, 0)
  result.setMinutes(result.getMinutes() + minutes)
  return result
}

function getCalendarMetrics(viewMode: ViewMode, zoomIndex: number): { columnWidth: number; pxPerMinute: number } {
  const verticalScales = [
    { day: 1.35, week: 1.05 },
    { day: 1.75, week: 1.35 },
    { day: 2.15, week: 1.7 },
  ]
  const scale = verticalScales[Math.min(verticalScales.length - 1, Math.max(0, zoomIndex))]
  return {
    columnWidth: viewMode === 'dia' ? 760 : 220,
    pxPerMinute: viewMode === 'dia' ? scale.day : scale.week,
  }
}

function DraggableBacklogCard({ ordem }: { ordem: Ordem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `backlog:${ordem.id}`,
    data: { type: 'backlog', ordemId: ordem.id } satisfies DragPayload,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab select-none rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-3 transition-colors duration-[120ms] hover:border-[#CDD2DA] active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
      style={{
        borderLeft: `4px solid ${ordem.produto?.cor ?? '#2563eb'}`,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[#111827]">{ordemLabel(ordem)}</div>
          <div className="mt-0.5 font-mono text-[11px] text-[#9CA3AF]">
            #{ordem.numero_externo} - {ordem.quantidade} {ordem.unidade}
          </div>
        </div>
        <span className="rounded-full bg-[#F0F2F5] px-2 py-0.5 text-[10px] font-medium uppercase text-[#4B5563]">
          {ordem.etapa}
        </span>
      </div>
      <div className="mt-1 flex gap-1 overflow-hidden font-mono text-[11px] text-[#9CA3AF]">
        {ordem.data_prevista && <span className="rounded-[6px] bg-[#F0F2F5] px-1.5 py-0.5">{ordem.data_prevista}</span>}
        {ordem.lote && <span className="truncate rounded-[6px] bg-[#F0F2F5] px-1.5 py-0.5">{ordem.lote}</span>}
        {ordem.tank_id && <span className="truncate rounded-[6px] bg-[#EFF6FF] px-1.5 py-0.5 text-[#2563EB]">{ordem.tank_id}</span>}
        {ordem.maquina_id && <span className="truncate rounded-[6px] bg-[#EFF6FF] px-1.5 py-0.5 text-[#2563EB]">{ordem.maquina_id}</span>}
      </div>
      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-[#9CA3AF]">
        {ordem.total_duration_minutes ? (
          <span className="rounded-[6px] bg-[#F0F2F5] px-1.5 py-0.5">{ordem.total_duration_minutes} min</span>
        ) : null}
        {ordem.estimated_boxes !== null && ordem.estimated_boxes !== undefined ? (
          <span className="rounded-[6px] bg-[#F0FDF4] px-1.5 py-0.5 text-[#16A34A]">{ordem.estimated_boxes} caixas</span>
        ) : null}
      </div>
    </div>
  )
}

function DroppableBacklog({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog-drop' })
  return (
    <div ref={setNodeRef} className={`min-h-24 space-y-2 p-3 ${isOver ? 'bg-[#EFF6FF]' : ''}`}>
      {children}
    </div>
  )
}

// Mantido como fallback da grade horizontal antiga enquanto a nova agenda vertical amadurece.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function MachineRow({
  maquina,
  ordens,
  rangeStart,
  dias,
  janela,
  pxPerMinute,
  dayWidth,
  rowWidth,
  viewMode,
  selected,
  focusMode = false,
  rowRef,
  onRemove,
  onSelect,
  onEdit,
}: {
  maquina: Maquina
  ordens: Ordem[]
  rangeStart: Date
  dias: Date[]
  janela: JanelaProducao
  pxPerMinute: number
  dayWidth: number
  rowWidth: number
  viewMode: ViewMode
  selected: boolean
  focusMode?: boolean
  rowRef: (node: HTMLDivElement | null) => void
  onRemove: (ordemId: string) => void
  onSelect: (maquinaId: string) => void
  onEdit: (ordemId: string, maquinaId: string, inicio: Date, fim: Date) => Promise<void>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `row:${maquina.id}` })
  const ocupacao = calcularOcupacaoMaquina(ordens, janela, dias)
  const hourMarks = useMemo(() => {
    const marks: number[] = []
    for (let h = janela.startHour; h <= janela.endHour; h++) marks.push(h)
    return marks
  }, [janela])

  return (
    <div className={`flex border-b bg-white transition-colors ${selected ? 'border-blue-300 shadow-[inset_4px_0_0_#2563eb]' : 'border-slate-200'}`}>
      <button
        type="button"
        onClick={() => onSelect(maquina.id)}
        className={`sticky left-0 z-20 flex ${focusMode ? 'w-64' : 'w-52'} shrink-0 flex-col justify-center border-r px-4 text-left transition-colors ${
          selected ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
        }`}
        title="Expandir configuracao da maquina"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-900">{maquina.nome}</div>
            <div className="mt-1 text-xs text-slate-500">{ordens.length} ordens agendadas</div>
          </div>
          <Maximize2 size={15} className={selected ? 'text-blue-700' : 'text-slate-400'} />
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${ocupacao > 90 ? 'bg-red-500' : ocupacao > 70 ? 'bg-amber-500' : 'bg-blue-600'}`}
            style={{ width: `${ocupacao}%` }}
          />
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase text-slate-500">{ocupacao.toFixed(0)}% ocupado</div>
      </button>

      <div
        ref={(node) => {
          setNodeRef(node)
          rowRef(node)
        }}
        className={`relative transition-colors ${
          focusMode ? 'min-h-[620px] bg-white' : selected ? 'min-h-44 bg-blue-50/20' : 'min-h-32'
        } ${isOver ? 'bg-blue-50/50' : 'bg-white'}`}
        style={{ width: rowWidth }}
      >
        {dias.map((dia, dayIndex) => (
          <div
            key={formatYmd(dia)}
            className="absolute inset-y-0 border-r border-slate-200 bg-white"
            style={{ left: dayIndex * dayWidth, width: dayWidth }}
          >
            {hourMarks.map((hour) => (
              <div
                key={`${formatYmd(dia)}-${hour}`}
                className={`absolute inset-y-0 border-l ${hour === janela.startHour ? 'border-slate-300' : 'border-slate-100'}`}
                style={{ left: (hour - janela.startHour) * 60 * pxPerMinute }}
              />
            ))}
          </div>
        ))}

        {ordens.map((ordem) => (
          <ScheduledEvent
            key={ordem.id}
            ordem={ordem}
            rangeStart={rangeStart}
            janela={janela}
            dayWidth={dayWidth}
            pxPerMinute={pxPerMinute}
            viewMode={viewMode}
            onRemove={onRemove}
            onEdit={(ordemId, inicio, fim) => onEdit(ordemId, maquina.id, inicio, fim)}
          />
        ))}
      </div>
    </div>
  )
}

function ScheduledEvent({
  ordem,
  rangeStart,
  janela,
  dayWidth,
  pxPerMinute,
  viewMode,
  onRemove,
  onEdit,
}: {
  ordem: Ordem
  rangeStart: Date
  janela: JanelaProducao
  dayWidth: number
  pxPerMinute: number
  viewMode: ViewMode
  onRemove: (ordemId: string) => void
  onEdit: (ordemId: string, inicio: Date, fim: Date) => Promise<void>
}) {
  const [draft, setDraft] = useState<{ inicio: Date; fim: Date } | null>(null)
  const [editing, setEditing] = useState<CalendarEditMode | null>(null)
  const draftRef = useRef<{ inicio: Date; fim: Date } | null>(null)
  const stateRef = useRef<{
    mode: CalendarEditMode
    startClientX: number
    initialInicio: Date
    initialFim: Date
  } | null>(null)

  if (!ordem.inicio_agendado || !ordem.fim_calculado) return null

  const inicio = draft?.inicio ?? new Date(ordem.inicio_agendado)
  const fim = draft?.fim ?? new Date(ordem.fim_calculado)
  const duration = Math.max(15, (fim.getTime() - inicio.getTime()) / 60000)
  const left = dateToPosition(inicio, rangeStart, janela, dayWidth, pxPerMinute)
  const width = Math.max(viewMode === 'semana' ? 76 : 120, duration * pxPerMinute)
  const color = ordem.produto?.cor ?? '#60a5fa'
  const minDurationMs = Math.max(15, janela.snapMinutes) * 60000

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, mode: CalendarEditMode) {
    if (!ordem.inicio_agendado || !ordem.fim_calculado) return
    e.preventDefault()
    e.stopPropagation()
    const initialInicio = draft?.inicio ?? new Date(ordem.inicio_agendado)
    const initialFim = draft?.fim ?? new Date(ordem.fim_calculado)
    stateRef.current = {
      mode,
      startClientX: e.clientX,
      initialInicio,
      initialFim,
    }
    setEditing(mode)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = stateRef.current
    if (!state) return

    const deltaMinutes = Math.round((e.clientX - state.startClientX) / pxPerMinute)
    const deltaMs = deltaMinutes * 60000
    let nextInicio = new Date(state.initialInicio)
    let nextFim = new Date(state.initialFim)

    if (state.mode === 'move') {
      nextInicio = new Date(state.initialInicio.getTime() + deltaMs)
      nextFim = new Date(state.initialFim.getTime() + deltaMs)
    }

    if (state.mode === 'resize-start') {
      nextInicio = new Date(Math.min(state.initialInicio.getTime() + deltaMs, state.initialFim.getTime() - minDurationMs))
    }

    if (state.mode === 'resize-end') {
      nextFim = new Date(Math.max(state.initialFim.getTime() + deltaMs, state.initialInicio.getTime() + minDurationMs))
    }

    nextInicio = snapDate(nextInicio, janela.snapMinutes)
    nextFim = snapDate(nextFim, janela.snapMinutes)
    if (nextFim <= nextInicio) nextFim = new Date(nextInicio.getTime() + minDurationMs)

    const nextDraft = { inicio: nextInicio, fim: nextFim }
    draftRef.current = nextDraft
    setDraft(nextDraft)
  }

  async function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const state = stateRef.current
    if (!state) return
    stateRef.current = null
    setEditing(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Pointer capture may already be released by the browser.
    }

    const nextInicio = draftRef.current?.inicio ?? state.initialInicio
    const nextFim = draftRef.current?.fim ?? state.initialFim
    const changed = nextInicio.getTime() !== state.initialInicio.getTime() || nextFim.getTime() !== state.initialFim.getTime()
    if (!changed) {
      draftRef.current = null
      setDraft(null)
      return
    }

    await onEdit(ordem.id, nextInicio, nextFim)
    draftRef.current = null
    setDraft(null)
  }

  return (
    <div
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        stateRef.current = null
        draftRef.current = null
        setEditing(null)
        setDraft(null)
      }}
      className={`group absolute top-3 h-24 select-none rounded-md border bg-white p-2 shadow-sm transition hover:z-30 hover:shadow-lg ${
        editing ? 'z-40 cursor-grabbing border-blue-400 ring-2 ring-blue-200' : 'cursor-grab border-black/10'
      }`}
      style={{
        left,
        width,
        background: `linear-gradient(90deg, ${color} 0 5px, white 5px)`,
      }}
      title={`${ordemLabel(ordem)}\n${formatarHora(inicio)} - ${formatarHora(fim)}\nArraste para mover. Puxe as bordas para ajustar inicio/fim.`}
    >
      <div
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-md bg-blue-500/0 transition group-hover:bg-blue-500/25"
        onPointerDown={(e) => handlePointerDown(e, 'resize-start')}
        title="Ajustar inicio"
      />
      <div
        className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-md bg-blue-500/0 transition group-hover:bg-blue-500/25"
        onPointerDown={(e) => handlePointerDown(e, 'resize-end')}
        title="Ajustar fim"
      />

      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 pl-1">
          <div className="truncate text-xs font-bold text-slate-900">{ordemLabel(ordem)}</div>
          <div className="mt-1 text-[10px] font-semibold text-slate-600">
            {formatarHora(inicio)} - {formatarHora(fim)} · {formatarDuracao(duration)}
          </div>
          <div className="mt-1 truncate text-[10px] text-slate-500">#{ordem.numero_externo}</div>
          <div className="mt-1 flex gap-1 overflow-hidden">
            <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold text-slate-600">
              {ordem.etapa}
            </span>
            {ordem.lote && (
              <span className="truncate rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500">{ordem.lote}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="rounded px-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onRemove(ordem.id)
          }}
          title="Desagendar"
        >
          x
        </button>
      </div>
    </div>
  )
}

function MachineCalendarBoard({
  maquina,
  ordens,
  rangeStart,
  dias,
  janela,
  viewMode,
  zoomIndex,
  zoomLabel,
  boardRef,
  onRemove,
  onEdit,
  onOpenOrder,
}: {
  maquina: Maquina
  ordens: Ordem[]
  rangeStart: Date
  dias: Date[]
  janela: JanelaProducao
  viewMode: ViewMode
  zoomIndex: number
  zoomLabel: string
  boardRef: (node: HTMLDivElement | null) => void
  onRemove: (ordemId: string) => void
  onEdit: (ordemId: string, maquinaId: string, inicio: Date, fim: Date) => Promise<void>
  onOpenOrder: (ordem: Ordem) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `board:${maquina.id}` })
  const { columnWidth, pxPerMinute } = getCalendarMetrics(viewMode, zoomIndex)
  const hourHeight = 60 * pxPerMinute
  const totalMinutes = Math.max(60, (janela.endHour - janela.startHour) * 60)
  const boardHeight = totalMinutes * pxPerMinute
  const boardWidth = columnWidth * dias.length
  const hourMarks = useMemo(() => {
    const marks: number[] = []
    for (let h = janela.startHour; h <= janela.endHour; h++) marks.push(h)
    return marks
  }, [janela])

  return (
    <div className="min-w-max">
      <div className="sticky top-0 z-30 flex border-b border-[#E4E7EC] bg-white">
        <div className="sticky left-0 z-40 w-20 shrink-0 border-r border-[#E4E7EC] bg-[#F7F8FA] px-3 py-3 text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">
          Hora
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${dias.length}, ${columnWidth}px)` }}>
          {dias.map((dia) => (
            <div
              key={formatYmd(dia)}
              className={`border-r border-[#E4E7EC] px-4 py-3 ${formatYmd(dia) === formatYmd(new Date()) ? 'bg-[#EFF6FF]' : ''}`}
            >
              <div className="text-lg font-semibold text-[#111827]">{format(dia, 'dd')}</div>
              <div className="text-[11px] font-medium uppercase text-[#9CA3AF]">{format(dia, 'EEE', { locale: ptBR })}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex">
        <div
          className="relative sticky left-0 z-20 w-20 shrink-0 border-r border-[#E4E7EC] bg-[#F7F8FA]"
          style={{ height: boardHeight }}
        >
          {hourMarks.map((hour) => (
            <div
              key={hour}
              className="absolute right-3 -translate-y-2 font-mono text-[11px] font-medium text-[#9CA3AF]"
              style={{ top: (hour - janela.startHour) * hourHeight }}
            >
              {String(hour).padStart(2, '0')}h
            </div>
          ))}
        </div>

        <div
          ref={(node) => {
            setNodeRef(node)
            boardRef(node)
          }}
          className={`relative bg-white transition-colors ${isOver ? 'bg-[#EFF6FF]' : ''}`}
          style={{ width: boardWidth, height: boardHeight }}
        >
          {dias.map((dia, dayIndex) => (
            <div
              key={formatYmd(dia)}
              className="absolute inset-y-0 border-r border-[#E4E7EC]"
              style={{ left: dayIndex * columnWidth, width: columnWidth }}
            >
              {hourMarks.map((hour) => (
                <div
                  key={`${formatYmd(dia)}-${hour}`}
                  className={`absolute inset-x-0 border-t ${hour === janela.startHour ? 'border-[#CDD2DA]' : 'border-[#E4E7EC]'}`}
                  style={{ top: (hour - janela.startHour) * hourHeight }}
                />
              ))}
            </div>
          ))}

          {ordens.map((ordem) => (
            <VerticalScheduledEvent
              key={ordem.id}
              ordem={ordem}
              rangeStart={rangeStart}
              dias={dias}
              janela={janela}
              columnWidth={columnWidth}
              pxPerMinute={pxPerMinute}
              onRemove={onRemove}
              onOpen={onOpenOrder}
              onEdit={(ordemId, inicio, fim) => onEdit(ordemId, maquina.id, inicio, fim)}
            />
          ))}

          {ordens.length === 0 && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="rounded-[12px] border border-dashed border-[#E4E7EC] bg-white px-8 py-6 text-center text-[13px] text-[#9CA3AF]">
                <CalendarClock size={16} className="mx-auto mb-2 text-[#9CA3AF]" />
                Arraste uma ordem do backlog para montar a agenda desta maquina.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-30 border-t border-[#E4E7EC] bg-white px-4 py-2 text-[11px] font-medium uppercase text-[#9CA3AF]">
        Escala {zoomLabel} - linhas de 1 hora - encaixe de {janela.snapMinutes} min
      </div>
    </div>
  )
}

function VerticalScheduledEvent({
  ordem,
  rangeStart,
  dias,
  janela,
  columnWidth,
  pxPerMinute,
  onRemove,
  onOpen,
  onEdit,
}: {
  ordem: Ordem
  rangeStart: Date
  dias: Date[]
  janela: JanelaProducao
  columnWidth: number
  pxPerMinute: number
  onRemove: (ordemId: string) => void
  onOpen: (ordem: Ordem) => void
  onEdit: (ordemId: string, inicio: Date, fim: Date) => Promise<void>
}) {
  const [draft, setDraft] = useState<{ inicio: Date; fim: Date } | null>(null)
  const [editing, setEditing] = useState<CalendarEditMode | null>(null)
  const draftRef = useRef<{ inicio: Date; fim: Date } | null>(null)
  const suppressClickRef = useRef(false)
  const stateRef = useRef<{
    mode: CalendarEditMode
    startClientY: number
    initialInicio: Date
    initialFim: Date
  } | null>(null)

  if (!ordem.inicio_agendado || !ordem.fim_calculado) return null

  const inicio = draft?.inicio ?? new Date(ordem.inicio_agendado)
  const fim = draft?.fim ?? new Date(ordem.fim_calculado)
  const duration = Math.max(15, (fim.getTime() - inicio.getTime()) / 60000)
  const dayOffset = Math.round((dateAtStartOfDay(inicio).getTime() - rangeStart.getTime()) / 86400000)
  if (dayOffset < 0 || dayOffset >= dias.length) return null

  const top = Math.max(0, minutesFromWindowStart(inicio, janela) * pxPerMinute)
  const height = Math.max(92, duration * pxPerMinute)
  const left = dayOffset * columnWidth + 12
  const width = columnWidth - 24
  const color = ordem.produto?.cor ?? '#2563eb'
  const minDurationMs = Math.max(15, janela.snapMinutes) * 60000

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, mode: CalendarEditMode) {
    if (!ordem.inicio_agendado || !ordem.fim_calculado) return
    e.preventDefault()
    e.stopPropagation()
    const initialInicio = draft?.inicio ?? new Date(ordem.inicio_agendado)
    const initialFim = draft?.fim ?? new Date(ordem.fim_calculado)
    stateRef.current = { mode, startClientY: e.clientY, initialInicio, initialFim }
    suppressClickRef.current = false
    setEditing(mode)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = stateRef.current
    if (!state) return

    const deltaMinutes = Math.round((e.clientY - state.startClientY) / pxPerMinute)
    if (Math.abs(e.clientY - state.startClientY) > 4) suppressClickRef.current = true
    const deltaMs = deltaMinutes * 60000
    let nextInicio = new Date(state.initialInicio)
    let nextFim = new Date(state.initialFim)

    if (state.mode === 'move') {
      nextInicio = new Date(state.initialInicio.getTime() + deltaMs)
      nextFim = new Date(state.initialFim.getTime() + deltaMs)
    }

    if (state.mode === 'resize-start') {
      nextInicio = new Date(Math.min(state.initialInicio.getTime() + deltaMs, state.initialFim.getTime() - minDurationMs))
    }

    if (state.mode === 'resize-end') {
      nextFim = new Date(Math.max(state.initialFim.getTime() + deltaMs, state.initialInicio.getTime() + minDurationMs))
    }

    nextInicio = snapDate(nextInicio, janela.snapMinutes)
    nextFim = snapDate(nextFim, janela.snapMinutes)
    if (nextFim <= nextInicio) nextFim = new Date(nextInicio.getTime() + minDurationMs)

    const nextDraft = { inicio: nextInicio, fim: nextFim }
    draftRef.current = nextDraft
    setDraft(nextDraft)
  }

  async function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const state = stateRef.current
    if (!state) return
    stateRef.current = null
    setEditing(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Pointer capture may already be released by the browser.
    }

    const nextInicio = draftRef.current?.inicio ?? state.initialInicio
    const nextFim = draftRef.current?.fim ?? state.initialFim
    const changed = nextInicio.getTime() !== state.initialInicio.getTime() || nextFim.getTime() !== state.initialFim.getTime()
    if (changed) await onEdit(ordem.id, nextInicio, nextFim)
    draftRef.current = null
    setDraft(null)
  }

  return (
    <div
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        stateRef.current = null
        draftRef.current = null
        setEditing(null)
        setDraft(null)
      }}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          return
        }
        if (!editing) onOpen(ordem)
      }}
      className={`group absolute overflow-hidden rounded-[8px] border bg-white shadow-[var(--shadow-sm)] transition-colors duration-[120ms] hover:z-30 hover:border-[#CDD2DA] ${
        editing ? 'z-40 cursor-grabbing border-[#2563EB] ring-2 ring-[#EFF6FF]' : 'cursor-pointer border-[#E4E7EC]'
      }`}
      style={{ top, left, width, height }}
      title={`${ordemLabel(ordem)}\n${formatarHora(inicio)} - ${formatarHora(fim)}`}
    >
      <div className="absolute inset-y-0 left-0 w-2.5" style={{ backgroundColor: color }} />
      <div
        className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize bg-[#2563EB]/0 transition group-hover:bg-[#2563EB]/20"
        onPointerDown={(e) => handlePointerDown(e, 'resize-start')}
        title="Ajustar inicio"
      />
      <div
        className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize bg-[#2563EB]/0 transition group-hover:bg-[#2563EB]/20"
        onPointerDown={(e) => handlePointerDown(e, 'resize-end')}
        title="Ajustar fim"
      />

      <div className="flex h-full flex-col justify-between gap-2 bg-white py-3 pl-5 pr-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 pr-1">
            <div className="line-clamp-2 text-[14px] font-semibold leading-5 text-[#111827]">{ordemLabel(ordem)}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-[6px] bg-[#EFF6FF] px-2 py-1 font-mono text-[11px] font-medium text-[#2563EB]">
                {formatarHora(inicio)} - {formatarHora(fim)}
              </span>
              <span className="rounded-[6px] bg-[#F0F2F5] px-2 py-1 font-mono text-[11px] font-medium text-[#4B5563]">
                {formatarDuracao(duration)}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-[#E4E7EC] bg-white text-[#9CA3AF] transition hover:border-[#DC2626]/30 hover:bg-red-50 hover:text-[#DC2626]"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onRemove(ordem.id)
            }}
            title="Desagendar"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex min-h-6 flex-wrap items-center gap-1 overflow-hidden text-[10px] font-medium uppercase tracking-wide">
          <span className="rounded-[6px] bg-[#111827] px-2 py-1 text-white">#{ordem.numero_externo}</span>
          <span className="rounded-[6px] bg-[#F0F2F5] px-2 py-1 text-[#4B5563]">{ordem.etapa}</span>
          {ordem.lote && <span className="truncate rounded-[6px] bg-[#F0F2F5] px-2 py-1 text-[#9CA3AF]">{ordem.lote}</span>}
        </div>
      </div>
    </div>
  )
}

function OrderConfigModal({
  ordem,
  maquinas,
  onClose,
  onSave,
}: {
  ordem: Ordem
  maquinas: Maquina[]
  onClose: () => void
  onSave: (ordem: Ordem, setupMin: number, producaoMin: number, limpezaMin: number) => Promise<void>
}) {
  const produto = ordem.produto
  const maquinaId = ordem.maquina_id ?? maquinas.find((maquina) => maquina.ativa)?.id ?? ''
  const maquina = maquinas.find((m) => m.id === maquinaId)
  const tempos = produto?.tempos_maquinas?.[maquinaId] ?? { setup: 0, producao: 60 }
  const inicio = ordem.inicio_agendado ? new Date(ordem.inicio_agendado) : null
  const fim = ordem.fim_calculado ? new Date(ordem.fim_calculado) : null
  const duracaoAtual = inicio && fim ? Math.max(0, (fim.getTime() - inicio.getTime()) / 60000) : 0
  const producaoInicial = ordem.duracao_planejada_min ?? (duracaoAtual > 0 ? Math.max(1, duracaoAtual - Number(tempos.setup ?? 0)) : Number(tempos.producao ?? 60))
  const [setupMin, setSetupMin] = useState(String(Number(tempos.setup ?? 0)))
  const [producaoMin, setProducaoMin] = useState(String(Number(producaoInicial)))
  const [limpezaMin, setLimpezaMin] = useState(String(Number(produto?.tempo_limpeza_min ?? 0)))
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    setErro('')
    if (!produto?.id) {
      setErro('Pedido sem produto vinculado para configurar tempos.')
      return
    }

    const setup = Math.max(0, Number(setupMin) || 0)
    const producao = Math.max(1, Number(producaoMin) || 1)
    const limpeza = Math.max(0, Number(limpezaMin) || 0)

    setSaving(true)
    try {
      await onSave(ordem, setup, producao, limpeza)
      onClose()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Nao foi possivel salvar os tempos do pedido.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/35 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[12px] border border-[#E4E7EC] bg-white shadow-[var(--shadow-md)]">
        <div className="border-b border-[#E4E7EC] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-[#2563EB]">Configurar pedido agendado</div>
              <h2 className="mt-1 truncate text-2xl font-semibold text-[#111827]">{ordemLabel(ordem)}</h2>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                #{ordem.numero_externo} - {maquina?.nome ?? 'Sem maquina'} - {ordem.quantidade} {ordem.unidade}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-[8px] border border-[#E4E7EC] text-[#9CA3AF] hover:bg-[#F7F8FA]"
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[8px] border border-[#E4E7EC] bg-[#F7F8FA] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Horario atual</div>
              <div className="mt-2 font-mono text-lg font-semibold text-[#111827]">
                {inicio && fim ? `${formatarHora(inicio)} - ${formatarHora(fim)}` : 'Sem horario'}
              </div>
              <div className="mt-1 text-sm text-[#9CA3AF]">{duracaoAtual ? formatarDuracao(duracaoAtual) : 'Nao calculado'}</div>
            </div>
            <div className="rounded-[8px] border border-[#E4E7EC] bg-[#F7F8FA] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Produto</div>
              <div className="mt-2 truncate font-mono text-lg font-semibold text-[#111827]">{produto?.sku ?? ordem.produto_sku ?? '--'}</div>
              <div className="mt-1 text-sm text-[#9CA3AF]">Volume base {produto?.volume_base ?? 3800} L</div>
            </div>
            <div className="rounded-[8px] border border-[#E4E7EC] bg-[#F7F8FA] p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Pedido</div>
              <div className="mt-2 text-lg font-semibold text-[#111827]">{ordem.etapa}</div>
              <div className="mt-1 truncate text-sm text-[#9CA3AF]">{ordem.lote ? `Lote ${ordem.lote}` : 'Sem lote informado'}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="block rounded-[8px] border border-[#E4E7EC] p-4">
              <span className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Setup</span>
              <input
                type="number"
                min="0"
                value={setupMin}
                onChange={(e) => setSetupMin(e.target.value)}
                className="mt-2 h-11 w-full rounded-[8px] border border-[#E4E7EC] px-3 font-mono text-lg font-semibold text-[#111827] outline-none focus:border-[#2563EB]"
              />
              <span className="mt-1 block text-xs text-[#9CA3AF]">minutos antes da producao</span>
            </label>
            <label className="block rounded-[8px] border border-[#E4E7EC] p-4">
              <span className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Tempo de producao</span>
              <input
                type="number"
                min="1"
                value={producaoMin}
                onChange={(e) => setProducaoMin(e.target.value)}
                className="mt-2 h-11 w-full rounded-[8px] border border-[#E4E7EC] px-3 font-mono text-lg font-semibold text-[#111827] outline-none focus:border-[#2563EB]"
              />
              <span className="mt-1 block text-xs text-[#9CA3AF]">minutos totais desta ordem</span>
            </label>
            <label className="block rounded-[8px] border border-[#E4E7EC] p-4">
              <span className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Tempo de limpeza</span>
              <input
                type="number"
                min="0"
                value={limpezaMin}
                onChange={(e) => setLimpezaMin(e.target.value)}
                className="mt-2 h-11 w-full rounded-[8px] border border-[#E4E7EC] px-3 font-mono text-lg font-semibold text-[#111827] outline-none focus:border-[#2563EB]"
              />
              <span className="mt-1 block text-xs text-[#9CA3AF]">minutos apos producao</span>
            </label>
          </div>

          <div className="mt-5 rounded-[8px] border border-[#E4E7EC] bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Informacoes do pedido</div>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <div><span className="font-bold text-slate-500">SKU:</span> {ordem.produto_sku ?? '--'}</div>
              <div><span className="font-bold text-slate-500">Status:</span> {ordem.status}</div>
              <div><span className="font-bold text-slate-500">Data prevista:</span> {ordem.data_prevista ?? '--'}</div>
              <div><span className="font-bold text-slate-500">Tanque:</span> {ordem.tanque ?? '--'}</div>
            </div>
          </div>

          {erro && <div className="mt-4 rounded-[8px] bg-red-50 px-4 py-3 text-sm text-[#DC2626]">{erro}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#E4E7EC] px-6 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-[8px] border border-[#CDD2DA] bg-white px-4 text-sm font-medium text-[#4B5563]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={saving}
            className="h-10 rounded-[8px] bg-[#2563EB] px-5 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar e recalcular agenda'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConflictModal({
  pending,
  ordens,
  maquinas,
  janela,
  onClose,
  onSave,
}: {
  pending: PendingDrop
  ordens: Ordem[]
  maquinas: Maquina[]
  janela: JanelaProducao
  onClose: () => void
  onSave: (primary: PendingDrop, secondary?: PendingDrop) => Promise<void>
}) {
  const ordem = ordens.find((o) => o.id === pending.ordemId)
  const conflito = pending.conflito
  const [primaryMachine, setPrimaryMachine] = useState(pending.maquinaId)
  const [primaryDate, setPrimaryDate] = useState(formatYmd(pending.inicio))
  const [primaryTime, setPrimaryTime] = useState(format(pending.inicio, 'HH:mm'))
  const [secondaryMachine, setSecondaryMachine] = useState(conflito?.maquina_id ?? pending.maquinaId)
  const [secondaryDate, setSecondaryDate] = useState(
    conflito?.inicio_agendado ? formatYmd(addDays(new Date(conflito.inicio_agendado), 0)) : primaryDate
  )
  const [secondaryTime, setSecondaryTime] = useState(
    conflito?.fim_calculado
      ? format(snapDate(new Date(conflito.fim_calculado), janela.snapMinutes), 'HH:mm')
      : horaParaInput(janela.startHour)
  )
  const [saving, setSaving] = useState(false)

  async function salvar() {
    setSaving(true)
    const primaryStart = new Date(`${primaryDate}T${primaryTime}:00`)
    const secondaryStart = conflito ? new Date(`${secondaryDate}T${secondaryTime}:00`) : null

    await onSave(
      { ordemId: pending.ordemId, maquinaId: primaryMachine, inicio: primaryStart, conflito },
      conflito && secondaryStart
        ? { ordemId: conflito.id, maquinaId: secondaryMachine, inicio: secondaryStart }
        : undefined
    )
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 p-4">
      <div className="w-full max-w-2xl rounded-[12px] border border-[#E4E7EC] bg-white shadow-[var(--shadow-md)]">
        <div className="border-b border-[#E4E7EC] px-5 py-4">
          <h2 className="text-lg font-semibold text-[#111827]">Resolver conflito de agenda</h2>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            Ajuste os horarios antes de salvar. A agenda so aceita a mudanca quando nao houver sobreposicao.
          </p>
          {pending.error && <p className="mt-2 rounded-[8px] bg-red-50 px-3 py-2 text-sm text-[#DC2626]">{pending.error}</p>}
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <ScheduleEditor
            title="Ordem movimentada"
            label={ordemLabel(ordem)}
            maquinas={maquinas}
            machine={primaryMachine}
            date={primaryDate}
            time={primaryTime}
            onMachine={setPrimaryMachine}
            onDate={setPrimaryDate}
            onTime={setPrimaryTime}
          />
          <ScheduleEditor
            title="Ordem conflitante"
            label={conflito ? ordemLabel(conflito) : 'Nenhuma ordem identificada'}
            maquinas={maquinas}
            machine={secondaryMachine}
            date={secondaryDate}
            time={secondaryTime}
            onMachine={setSecondaryMachine}
            onDate={setSecondaryDate}
            onTime={setSecondaryTime}
            disabled={!conflito}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-[#E4E7EC] px-5 py-4">
          <button onClick={onClose} className="rounded-[8px] border border-[#CDD2DA] bg-white px-4 py-2 text-sm font-medium text-[#4B5563]">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving}
            className="rounded-[8px] bg-[#2563EB] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar reprogramacao'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleEditor({
  title,
  label,
  maquinas,
  machine,
  date,
  time,
  disabled,
  onMachine,
  onDate,
  onTime,
}: {
  title: string
  label: string
  maquinas: Maquina[]
  machine: string
  date: string
  time: string
  disabled?: boolean
  onMachine: (value: string) => void
  onDate: (value: string) => void
  onTime: (value: string) => void
}) {
  return (
    <div className="rounded-[8px] border border-[#E4E7EC] bg-[#F7F8FA] p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">{title}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[#111827]">{label}</div>
      <div className="mt-3 space-y-2">
        <select
          value={machine}
          disabled={disabled}
          onChange={(e) => onMachine(e.target.value)}
          className="h-9 w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 text-sm text-[#111827] disabled:opacity-50"
        >
          {maquinas.filter((m) => m.ativa).map((maquina) => (
            <option key={maquina.id} value={maquina.id}>
              {maquina.nome}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={date}
            disabled={disabled}
            onChange={(e) => onDate(e.target.value)}
            className="h-9 rounded-[8px] border border-[#E4E7EC] bg-white px-3 text-sm text-[#111827] disabled:opacity-50"
          />
          <input
            type="time"
            value={time}
            disabled={disabled}
            onChange={(e) => onTime(e.target.value)}
            className="h-9 rounded-[8px] border border-[#E4E7EC] bg-white px-3 text-sm text-[#111827] disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  )
}

function MachineInspector({
  maquina,
  ordens,
  maquinas,
  janela,
  dias,
  onClose,
  onSave,
  onRemove,
  onFocusDia,
}: {
  maquina: Maquina
  ordens: Ordem[]
  maquinas: Maquina[]
  janela: JanelaProducao
  dias: Date[]
  onClose: () => void
  onSave: (ordemId: string, maquinaId: string, inicio: Date) => Promise<void>
  onRemove: (ordemId: string) => Promise<void>
  onFocusDia: (dia: Date) => void
}) {
  const agenda = useMemo(() => ordenarAgendaMaquina(ordens), [ordens])
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(agenda[0]?.id ?? null)
  const selectedOrder = agenda.find((ordem) => ordem.id === selectedOrderId) ?? agenda[0] ?? null
  const [machine, setMachine] = useState(maquina.id)
  const [date, setDate] = useState(selectedOrder?.inicio_agendado ? formatYmd(new Date(selectedOrder.inicio_agendado)) : formatYmd(new Date()))
  const [time, setTime] = useState(selectedOrder?.inicio_agendado ? format(new Date(selectedOrder.inicio_agendado), 'HH:mm') : horaParaInput(janela.startHour))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedOrderId((current) => {
      if (current && agenda.some((ordem) => ordem.id === current)) return current
      return agenda[0]?.id ?? null
    })
  }, [agenda])

  useEffect(() => {
    setMachine(selectedOrder?.maquina_id ?? maquina.id)
    setDate(selectedOrder?.inicio_agendado ? formatYmd(new Date(selectedOrder.inicio_agendado)) : formatYmd(new Date()))
    setTime(selectedOrder?.inicio_agendado ? format(new Date(selectedOrder.inicio_agendado), 'HH:mm') : horaParaInput(janela.startHour))
  }, [selectedOrder, maquina.id, janela.startHour])

  const ocupacao = calcularOcupacaoMaquina(agenda, janela, dias)
  const totalTanque = agenda.filter((ordem) => ordem.etapa === 'tanque').length
  const totalEnvase = agenda.filter((ordem) => ordem.etapa === 'envase').length
  const duration = selectedOrder ? getOrdemDurationMin(selectedOrder, machine) : 0

  async function salvar() {
    if (!selectedOrder) return
    setSaving(true)
    await onSave(selectedOrder.id, machine, new Date(`${date}T${time}:00`))
    setSaving(false)
  }

  return (
    <aside className="flex max-h-[360px] w-full flex-col overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase text-blue-700">
              <Settings2 size={14} />
              Maquina expandida
            </div>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">{maquina.nome}</h2>
            <p className="text-xs text-slate-500">Produtos e ordens da agenda visivel</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            title="Fechar painel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">Agenda</div>
            <div className="text-lg font-black text-slate-900">{agenda.length}</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">Tanque</div>
            <div className="text-lg font-black text-cyan-700">{totalTanque}</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">Envase</div>
            <div className="text-lg font-black text-violet-700">{totalEnvase}</div>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] font-bold uppercase text-slate-500">
            <span>Ocupacao da janela</span>
            <span>{ocupacao.toFixed(0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${ocupacao > 90 ? 'bg-red-500' : ocupacao > 70 ? 'bg-amber-500' : 'bg-blue-600'}`}
              style={{ width: `${ocupacao}%` }}
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
            <CalendarClock size={14} />
            Esteira da maquina
          </div>
          <div className="space-y-2">
            {agenda.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">
                Nenhum produto agendado para esta maquina na janela atual.
              </div>
            ) : (
              agenda.map((ordem) => {
                const inicio = ordem.inicio_agendado ? new Date(ordem.inicio_agendado) : null
                const isSelected = selectedOrder?.id === ordem.id
                return (
                  <button
                    key={ordem.id}
                    type="button"
                    onClick={() => setSelectedOrderId(ordem.id)}
                    className={`w-full rounded-md border p-2 text-left transition ${
                      isSelected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                    style={{ borderLeft: `4px solid ${ordem.produto?.cor ?? '#2563eb'}` }}
                  >
                    <div className="flex items-start gap-2">
                      <Package size={15} className={isSelected ? 'mt-0.5 text-blue-700' : 'mt-0.5 text-slate-400'} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-slate-900">{ordemLabel(ordem)}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {inicio ? `${format(inicio, 'dd/MM')} as ${formatarHora(inicio)}` : 'Sem horario'} · #{ordem.numero_externo}
                        </div>
                      </div>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        {ordem.etapa}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
            <Clock size={14} />
            Configurar produto na agenda
          </div>

          {selectedOrder ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="truncate text-base font-black text-slate-900">{ordemLabel(selectedOrder)}</div>
                <div className="mt-1 text-xs text-slate-500">
                  SKU {selectedOrder.produto_sku ?? '--'} · {selectedOrder.quantidade} {selectedOrder.unidade}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <span className="rounded bg-white px-2 py-1">Duracao calc.: {formatarDuracao(duration)}</span>
                  <span className="rounded bg-white px-2 py-1">Etapa: {selectedOrder.etapa}</span>
                  {selectedOrder.lote && <span className="rounded bg-white px-2 py-1">Lote: {selectedOrder.lote}</span>}
                  {selectedOrder.tanque && <span className="rounded bg-white px-2 py-1">Tanque: {selectedOrder.tanque}</span>}
                </div>
              </div>

              <ScheduleEditor
                title="Reprogramacao"
                label="Ajuste maquina, data e inicio"
                maquinas={maquinas}
                machine={machine}
                date={date}
                time={time}
                onMachine={setMachine}
                onDate={setDate}
                onTime={setTime}
              />

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={salvar}
                  disabled={saving}
                  className="h-10 rounded-md bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar ajuste'}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(selectedOrder.id)}
                  className="h-10 rounded-md border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Desagendar
                </button>
              </div>

              {selectedOrder.inicio_agendado && (
                <button
                  type="button"
                  onClick={() => onFocusDia(new Date(selectedOrder.inicio_agendado!))}
                  className="h-9 w-full rounded-md border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Abrir este produto no dia
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
              Selecione uma ordem da esteira para configurar.
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export default function CalendarioPage() {
  const [diaBase, setDiaBase] = useState<Date>(() => new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('semana')
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [mensagem, setMensagem] = useState('')
  const [novaOrdemAberta, setNovaOrdemAberta] = useState(false)
  const [janela, setJanela] = useState<JanelaProducao>(DEFAULT_JANELA_PRODUCAO)
  const [zoomIndex, setZoomIndex] = useState(1)
  const [busca, setBusca] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState<'todas' | 'tanque' | 'envase'>('todas')
  const [activePayload, setActivePayload] = useState<DragPayload | null>(null)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [configOrder, setConfigOrder] = useState<Ordem | null>(null)
  const [resourceTab, setResourceTab] = useState<'tanque' | 'envase'>('envase')
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const range = useMemo(() => getInicioFimVisivel(diaBase, viewMode), [diaBase, viewMode])
  const inicioYmd = formatYmd(range.inicio)
  const fimYmd = formatYmd(range.fim)
  const zoom = ZOOM_OPTIONS[zoomIndex]
  const pxPerMinute = viewMode === 'dia' ? zoom.pxPerMinuteDay : zoom.pxPerMinuteWeek
  const dayWidth = (janela.endHour - janela.startHour) * 60 * pxPerMinute

  const carregarDados = useCallback(async () => {
    try {
      setMensagem('')
      const [m, t, o, p] = await Promise.all([
        fetch('/api/maquinas').then((r) => r.json()),
        fetch('/api/tanques').then((r) => r.json()),
        fetch(`/api/ordens?inicio=${inicioYmd}&fim=${fimYmd}`).then((r) => r.json()),
        fetch('/api/produtos').then((r) => r.json()),
      ])

      setMaquinas(Array.isArray(m) ? m : [])
      setTanques(Array.isArray(t) ? t : [])
      setOrdens(Array.isArray(o) ? o : [])
      setProdutos(Array.isArray(p) ? p : [])

      if (o?.error) setMensagem(o.error)
    } catch {
      setMensagem('Erro ao carregar calendario de producao.')
    }
  }, [inicioYmd, fimYmd])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  useEffect(() => {
    try {
      const savedView = localStorage.getItem(VIEW_STORAGE_KEY)
      if (savedView === 'dia' || savedView === 'semana') setViewMode(savedView)

      const savedMachine = localStorage.getItem(MACHINE_STORAGE_KEY)
      if (savedMachine) setSelectedMachineId(savedMachine)

      const savedTab = localStorage.getItem(TAB_STORAGE_KEY)
      if (savedTab === 'tanque' || savedTab === 'envase') setResourceTab(savedTab)

      const salvo = localStorage.getItem(JANELA_STORAGE_KEY)
      if (salvo) setJanela(sanitizarJanelaProducao(JSON.parse(salvo)))
    } catch {
      // Mantem padroes quando armazenamento local estiver indisponivel.
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    if (selectedMachineId) localStorage.setItem(MACHINE_STORAGE_KEY, selectedMachineId)
  }, [selectedMachineId])

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, resourceTab)
  }, [resourceTab])

  useEffect(() => {
    localStorage.setItem(JANELA_STORAGE_KEY, JSON.stringify(janela))
  }, [janela])

  const maquinasAtivas = useMemo(() => maquinas.filter((m) => m.ativa), [maquinas])
  const tanquesAtivos = useMemo(() => tanques.filter((t) => t.ativo), [tanques])
  const recursosAtivos = useMemo(
    () =>
      resourceTab === 'envase'
        ? maquinasAtivas.map((m) => ({ id: m.id, nome: m.nome }))
        : tanquesAtivos.map((t) => ({ id: t.id, nome: t.nome })),
    [maquinasAtivas, tanquesAtivos, resourceTab]
  )
  const ordensAtivas = useMemo(
    () => ordens.filter((o) => o.status !== 'cancelada').filter((o) => isOrdemNaJanela(o, inicioYmd, fimYmd)),
    [ordens, inicioYmd, fimYmd]
  )
  const ordensAgendadas = useMemo(
    () =>
      ordensAtivas.filter((o) => {
        if (!o.inicio_agendado) return false
        if (resourceTab === 'envase') return Boolean(o.maquina_id)
        return Boolean(o.tank_id)
      }),
    [ordensAtivas, resourceTab]
  )
  const selectedMachine = useMemo(
    () => recursosAtivos.find((resource) => resource.id === selectedMachineId) ?? null,
    [recursosAtivos, selectedMachineId]
  )
  const selectedMachineOrdens = useMemo(
    () =>
      selectedMachine
        ? ordensAgendadas.filter((ordem) =>
            resourceTab === 'envase' ? ordem.maquina_id === selectedMachine.id : ordem.tank_id === selectedMachine.id
          )
        : [],
    [selectedMachine, ordensAgendadas, resourceTab]
  )

  useEffect(() => {
    if (recursosAtivos.length === 0) {
      setSelectedMachineId(null)
      return
    }

    if (!selectedMachineId || !recursosAtivos.some((resource) => resource.id === selectedMachineId)) {
      setSelectedMachineId(recursosAtivos[0].id)
    }
  }, [recursosAtivos, selectedMachineId])
  const ordensBacklog = useMemo(() => {
    const termo = normalizarBusca(busca)
    const etapaBacklog = filtroEtapa === 'todas' ? resourceTab : filtroEtapa

    return ordensAtivas
      .filter((o) => ordemPlanningStatus(o) === 'BACKLOG')
      .filter((o) => o.etapa === etapaBacklog)
      .filter((o) => {
        if (!termo) return true
        return [o.produto?.nome, o.produto_sku, o.numero_externo, o.lote, o.tanque]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(termo))
      })
  }, [ordensAtivas, busca, filtroEtapa, resourceTab])

  async function patchAgenda(
    ordemId: string,
    maquinaId: string | null,
    inicio: Date | null,
    fim?: Date | null
  ): Promise<{ ok: boolean; status: number; error?: string }> {
    const res = await fetch('/api/ordens', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: ordemId,
        maquina_id: resourceTab === 'envase' ? maquinaId : null,
        tank_id: resourceTab === 'tanque' ? maquinaId : undefined,
        planning_status: inicio ? 'SCHEDULED' : 'BACKLOG',
        inicio_agendado: inicio?.toISOString() ?? null,
        ...(fim ? { fim_calculado: fim.toISOString() } : {}),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, status: res.status, error: data.error ?? 'Nao foi possivel salvar a agenda.' }
    return { ok: true, status: res.status }
  }

  async function salvarAgenda(ordemId: string, maquinaId: string, inicio: Date, fim?: Date) {
    const result = await patchAgenda(ordemId, maquinaId, inicio, fim)
    if (result.ok) {
      await carregarDados()
      return
    }

    if (result.status !== 409) {
      setMensagem(result.error ?? 'Nao foi possivel salvar a agenda.')
      return
    }

    if (resourceTab === 'tanque') {
      setMensagem(result.error ?? 'Conflito no tanque selecionado.')
      return
    }

    const ordem = ordens.find((o) => o.id === ordemId)
    setPendingDrop({
      ordemId,
      maquinaId,
      inicio,
      fim,
      conflito: ordem ? encontrarConflito(ordensAgendadas, ordem, maquinaId, inicio) : null,
      error: result.error,
    })
  }

  async function salvarAgendaComFim(ordemId: string, maquinaId: string, inicio: Date, fim: Date) {
    await salvarAgenda(ordemId, maquinaId, inicio, fim)
  }

  async function desagendar(ordemId: string) {
    const result = await patchAgenda(ordemId, null, null)
    if (!result.ok) {
      setMensagem(result.error ?? 'Nao foi possivel desagendar.')
      return
    }
    await carregarDados()
  }

  function handleDragStart(event: DragStartEvent) {
    setActivePayload((event.active.data.current as DragPayload | undefined) ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const payload = event.active.data.current as DragPayload | undefined
    setActivePayload(null)
    if (!payload || !event.over) return

    if (event.over.id === 'backlog-drop' && payload.type === 'scheduled') {
      await desagendar(payload.ordemId)
      return
    }

    const overId = String(event.over.id)
    if (!overId.startsWith('row:') && !overId.startsWith('board:')) return

    const isBoardDrop = overId.startsWith('board:')
    const maquinaId = overId.replace(isBoardDrop ? 'board:' : 'row:', '')
    const row = rowRefs.current[maquinaId]
    const translated = event.active.rect.current.translated
    if (!row || !translated) return

    const rect = row.getBoundingClientRect()
    const centerX = translated.left + translated.width / 2
    const centerY = translated.top + translated.height / 2
    const x = centerX - rect.left + row.scrollLeft
    const y = centerY - rect.top + row.scrollTop
    const calendarMetrics = getCalendarMetrics(viewMode, zoomIndex)
    const inicio = snapDate(
      isBoardDrop
        ? positionToCalendarDate(x, y, range.inicio, janela, calendarMetrics.columnWidth, calendarMetrics.pxPerMinute, range.dias.length)
        : positionToDate(x, range.inicio, janela, dayWidth, pxPerMinute),
      janela.snapMinutes
    )
    await salvarAgenda(payload.ordemId, maquinaId, inicio)
  }

  async function salvarConflito(primary: PendingDrop, secondary?: PendingDrop) {
    if (secondary) {
      const secondaryResult = await patchAgenda(secondary.ordemId, secondary.maquinaId, secondary.inicio, secondary.fim)
      if (!secondaryResult.ok) {
        setPendingDrop((current) => current ? { ...current, error: secondaryResult.error } : current)
        return
      }
    }

    const primaryResult = await patchAgenda(primary.ordemId, primary.maquinaId, primary.inicio, primary.fim)
    if (!primaryResult.ok) {
      const ordem = ordens.find((o) => o.id === primary.ordemId)
      setPendingDrop({
        ...primary,
        conflito: ordem ? encontrarConflito(ordensAgendadas, ordem, primary.maquinaId, primary.inicio) : null,
        error: primaryResult.error,
      })
      return
    }

    setPendingDrop(null)
    await carregarDados()
  }

  async function salvarConfiguracaoPedido(ordem: Ordem, setupMin: number, producaoMin: number, limpezaMin: number) {
    if (!ordem.produto?.id) throw new Error('Pedido sem produto vinculado para configurar tempos.')
    const maquinaId = ordem.maquina_id ?? selectedMachineId
    if (!maquinaId) throw new Error('Selecione uma maquina para configurar o tempo de producao.')

    const produtoAtualizado: Produto = {
      ...ordem.produto,
      tempo_limpeza_min: limpezaMin,
      tempos_maquinas: {
        ...(ordem.produto.tempos_maquinas ?? {}),
        [maquinaId]: { setup: setupMin, producao: producaoMin },
      },
    }

    const produtoRes = await fetch('/api/produtos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: produtoAtualizado.id,
        tempos_maquinas: produtoAtualizado.tempos_maquinas,
        tempo_limpeza_min: produtoAtualizado.tempo_limpeza_min,
      }),
    })
    const produtoData = await produtoRes.json().catch(() => ({}))
    if (!produtoRes.ok) throw new Error(produtoData.error ?? 'Nao foi possivel salvar os tempos do produto.')

    if (ordem.inicio_agendado) {
      const inicio = new Date(ordem.inicio_agendado)
      const duracaoPlanejada = Math.max(1, setupMin + producaoMin)
      const result = await patchAgenda(
        ordem.id,
        maquinaId,
        inicio,
        calcularFim(inicio, duracaoPlanejada)
      )
      if (!result.ok) throw new Error(result.error ?? 'Tempos salvos, mas nao foi possivel recalcular a agenda.')
    }

    await carregarDados()
  }

  const activeOrdem = activePayload ? ordens.find((ordem) => ordem.id === activePayload.ordemId) : null
  const periodoLabel =
    viewMode === 'dia'
      ? format(range.inicio, "EEEE, dd 'de' MMMM", { locale: ptBR })
      : `${format(range.inicio, 'dd MMM', { locale: ptBR })} - ${format(range.fim, 'dd MMM yyyy', { locale: ptBR })}`

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full flex-col overflow-hidden bg-[#F7F8FA]">
        <header className="border-b border-[#E4E7EC] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h1 className="text-[22px] font-semibold text-[#111827]">Calendario de Producao</h1>
              <p className="text-[13px] text-[#9CA3AF]">Separacao operacional por Tanques e Envase</p>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                onClick={() => setDiaBase((d) => (viewMode === 'dia' ? subDays(d, 1) : subDays(d, 7)))}
                className="grid h-9 w-9 place-items-center rounded-[8px] border border-[#E4E7EC] text-[#4B5563] hover:bg-[#F7F8FA]"
                title="Periodo anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setDiaBase(new Date())}
                className="h-9 rounded-[8px] border border-[#2563EB] bg-white px-3 text-sm font-medium text-[#2563EB] hover:bg-[#EFF6FF]"
              >
                Hoje
              </button>
              <button
                onClick={() => setDiaBase((d) => (viewMode === 'dia' ? addDays(d, 1) : addDays(d, 7)))}
                className="grid h-9 w-9 place-items-center rounded-[8px] border border-[#E4E7EC] text-[#4B5563] hover:bg-[#F7F8FA]"
                title="Proximo periodo"
              >
                <ChevronRight size={18} />
              </button>

              <div className="min-w-56 text-center text-sm font-medium text-[#111827]">{periodoLabel}</div>

              <div className="flex rounded-[8px] border border-[#E4E7EC] bg-[#F0F2F5] p-1">
                {(['semana', 'dia'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`h-7 rounded-[6px] px-3 text-xs font-medium uppercase ${
                      viewMode === mode ? 'bg-white text-[#2563EB] shadow-[var(--shadow-sm)]' : 'text-[#9CA3AF]'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[8px] bg-[#F0F2F5] p-3">
            <label className="text-xs font-semibold uppercase text-[#4B5563]">Inicio</label>
            <input
              type="time"
              step={3600}
              value={horaParaInput(janela.startHour)}
              onChange={(e) => setJanela((j) => sanitizarJanelaProducao({ ...j, startHour: inputParaHora(e.target.value, j.startHour) }))}
              className="h-8 rounded-[6px] border-0 bg-white px-2 text-sm text-[#111827]"
            />
            <label className="text-xs font-semibold uppercase text-[#4B5563]">Fim</label>
            <input
              type="time"
              step={3600}
              value={horaParaInput(janela.endHour % 24 === 0 ? 0 : janela.endHour)}
              onChange={(e) => {
                const hora = inputParaHora(e.target.value, janela.endHour)
                setJanela((j) => sanitizarJanelaProducao({ ...j, endHour: hora === 0 ? 24 : hora }))
              }}
              className="h-8 rounded-[6px] border-0 bg-white px-2 text-sm text-[#111827]"
            />
            <label className="text-xs font-semibold uppercase text-[#4B5563]">Snap</label>
            <select
              value={janela.snapMinutes}
              onChange={(e) => setJanela((j) => sanitizarJanelaProducao({ ...j, snapMinutes: Number(e.target.value) }))}
              className="h-8 rounded-[6px] border-0 bg-white px-2 text-sm text-[#111827]"
            >
              {SNAP_OPTIONS.map((snap) => (
                <option key={snap} value={snap}>
                  {snap} min
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1 rounded-[8px] border border-[#E4E7EC] bg-white p-1">
              <button
                onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
                className="grid h-7 w-7 place-items-center rounded-[6px] text-[#4B5563] hover:bg-[#F0F2F5]"
                title="Reduzir zoom"
              >
                <ZoomOut size={15} />
              </button>
              <span className="w-20 text-center text-xs font-medium text-[#4B5563]">{zoom.label}</span>
              <button
                onClick={() => setZoomIndex((i) => Math.min(ZOOM_OPTIONS.length - 1, i + 1))}
                className="grid h-7 w-7 place-items-center rounded-[6px] text-[#4B5563] hover:bg-[#F0F2F5]"
                title="Aumentar zoom"
              >
                <ZoomIn size={15} />
              </button>
            </div>
          </div>
        </header>

        {mensagem && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{mensagem}</div>}

        <main className="flex min-h-0 flex-1 gap-3 p-3">
          <aside className="flex w-72 shrink-0 flex-col overflow-hidden rounded-[12px] border border-[#E4E7EC] bg-white">
            <div className="border-b border-[#E4E7EC] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-[#111827]">Backlog</h2>
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#2563EB] px-1 text-[10px] font-medium text-white">
                    {ordensBacklog.length}
                  </span>
                </div>
                <button
                  onClick={() => setNovaOrdemAberta(true)}
                  className="grid h-7 w-7 place-items-center rounded-full bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                  title="Nova ordem"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="mt-3 flex h-9 items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-2 focus-within:border-[#2563EB]">
                <Search size={15} className="text-[#9CA3AF]" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar produto, SKU, lote..."
                  className="h-9 min-w-0 flex-1 text-sm text-[#111827] outline-none"
                />
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-[#F0F2F5] p-1">
                {(['todas', 'tanque', 'envase'] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => {
                      setFiltroEtapa(value)
                      if (value !== 'todas') setResourceTab(value)
                    }}
                    className={`h-7 rounded-full text-xs font-medium ${filtroEtapa === value ? 'bg-[#2563EB] text-white' : 'text-[#9CA3AF]'}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <DroppableBacklog>
                {ordensBacklog.length === 0 ? (
                  <div className="rounded-[12px] border border-dashed border-[#E4E7EC] p-6 text-center text-[13px] text-[#9CA3AF]">
                    Nenhuma ordem pendente nesta janela.
                  </div>
                ) : (
                  ordensBacklog.map((ordem) => <DraggableBacklogCard key={ordem.id} ordem={ordem} />)
                )}
              </DroppableBacklog>
            </div>
          </aside>

          <section className="min-w-0 flex-1 overflow-hidden rounded-[12px] border border-[#E4E7EC] bg-white">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-[#E4E7EC] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#111827]">
                      {resourceTab === 'envase' ? 'Calendario de Envase (Maquinas)' : 'Calendario de Tanques'}
                    </h2>
                    <p className="text-xs text-[#9CA3AF]">
                      {selectedMachine ? `${selectedMachine.nome} com ${selectedMachineOrdens.length} ordens agendadas` : 'Selecione um recurso ativo'}
                    </p>
                  </div>
                  {selectedMachine && (
                    <div className="flex items-center divide-x divide-[#E4E7EC] rounded-[8px] border border-[#E4E7EC] bg-white text-right">
                      <span className="px-3 py-1.5">
                        <span className="block text-[10px] uppercase tracking-wide text-[#9CA3AF]">% ocupado</span>
                        <span className="font-mono text-[13px] font-semibold text-[#111827]">
                          {calcularOcupacaoMaquina(selectedMachineOrdens, janela, range.dias).toFixed(0)}
                        </span>
                      </span>
                      <span className="px-3 py-1.5">
                        <span className="block text-[10px] uppercase tracking-wide text-[#9CA3AF]">tanque</span>
                        <span className="font-mono text-[13px] font-semibold text-[#111827]">
                          {selectedMachineOrdens.filter((ordem) => ordem.etapa === 'tanque').length}
                        </span>
                      </span>
                      <span className="px-3 py-1.5">
                        <span className="block text-[10px] uppercase tracking-wide text-[#9CA3AF]">envase</span>
                        <span className="font-mono text-[13px] font-semibold text-[#111827]">
                          {selectedMachineOrdens.filter((ordem) => ordem.etapa === 'envase').length}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex w-fit rounded-[8px] border border-[#E4E7EC] bg-[#F0F2F5] p-1">
                  {(['tanque', 'envase'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setResourceTab(tab)
                        if (filtroEtapa !== 'todas') setFiltroEtapa(tab)
                      }}
                      className={`h-7 rounded-[6px] px-3 text-xs font-medium uppercase ${
                        resourceTab === tab ? 'bg-white text-[#2563EB] shadow-[var(--shadow-sm)]' : 'text-[#9CA3AF]'
                      }`}
                    >
                      {tab === 'tanque' ? 'Tanques' : 'Envase'}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {recursosAtivos.map((resource) => {
                    const agendaRecurso = ordensAgendadas.filter((ordem) =>
                      resourceTab === 'envase' ? ordem.maquina_id === resource.id : ordem.tank_id === resource.id
                    )
                    const active = selectedMachineId === resource.id
                    return (
                      <button
                        key={resource.id}
                        type="button"
                        onClick={() => setSelectedMachineId(resource.id)}
                        className={`min-w-48 border-b-2 px-3 py-2 text-left transition ${
                          active ? 'border-[#2563EB] text-[#2563EB]' : 'border-transparent text-[#4B5563] hover:text-[#111827]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-semibold">{resource.nome}</div>
                          <span className="rounded-full bg-[#F0F2F5] px-1.5 py-0.5 text-[10px] text-[#9CA3AF]">{agendaRecurso.length}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-[#9CA3AF]">ordens no periodo</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto bg-[#F7F8FA]">
                {selectedMachine ? (
                  <MachineCalendarBoard
                    key={selectedMachine.id}
                    maquina={{ id: selectedMachine.id, nome: selectedMachine.nome, ativa: true, criado_em: '' }}
                    ordens={selectedMachineOrdens}
                    rangeStart={range.inicio}
                    dias={range.dias}
                    janela={janela}
                    viewMode={viewMode}
                    zoomIndex={zoomIndex}
                    zoomLabel={zoom.label}
                    boardRef={(node) => {
                      rowRefs.current[selectedMachine.id] = node
                    }}
                    onRemove={desagendar}
                    onOpenOrder={setConfigOrder}
                    onEdit={salvarAgendaComFim}
                  />
                ) : (
                  <div className="p-10 text-center text-sm text-[#9CA3AF]">Nenhum recurso ativo cadastrado.</div>
                )}
              </div>

              {selectedMachine && resourceTab === 'envase' && (
                <div className="border-t border-[#E4E7EC] bg-white p-3">
                  <MachineInspector
                    maquina={{ id: selectedMachine.id, nome: selectedMachine.nome, ativa: true, criado_em: '' }}
                    ordens={selectedMachineOrdens}
                    maquinas={maquinas}
                    janela={janela}
                    dias={range.dias}
                    onClose={() => setSelectedMachineId(recursosAtivos[0]?.id ?? null)}
                    onSave={salvarAgenda}
                    onRemove={desagendar}
                    onFocusDia={(dia) => {
                      setDiaBase(dia)
                      setViewMode('dia')
                    }}
                  />
                </div>
              )}
            </div>
          </section>
        </main>

        {novaOrdemAberta && (
          <NovaOrdemForm
            produtos={produtos}
            dataInicial={diaBase}
            onSalvo={() => {
              setNovaOrdemAberta(false)
              carregarDados()
            }}
            onFechar={() => setNovaOrdemAberta(false)}
          />
        )}

        {pendingDrop && resourceTab === 'envase' && (
          <ConflictModal
            pending={pendingDrop}
            ordens={ordensAtivas}
            maquinas={maquinas}
            janela={janela}
            onClose={() => setPendingDrop(null)}
            onSave={salvarConflito}
          />
        )}

        {configOrder && (
          <OrderConfigModal
            ordem={configOrder}
            maquinas={maquinas}
            onClose={() => setConfigOrder(null)}
            onSave={salvarConfiguracaoPedido}
          />
        )}

        <DragOverlay>
          {activeOrdem ? (
            <div className="w-64 rounded-md border border-blue-300 bg-white px-3 py-2 shadow-2xl">
              <div className="truncate text-sm font-bold text-slate-900">{ordemLabel(activeOrdem)}</div>
              <div className="mt-1 text-xs text-slate-500">
                <RotateCcw size={12} className="mr-1 inline" />
                {resourceTab === 'envase' ? 'Solte na maquina e horario desejados' : 'Solte no tanque e horario desejados'}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  )
}
