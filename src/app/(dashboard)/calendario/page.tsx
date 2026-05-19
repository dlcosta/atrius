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
import type { Maquina, Ordem, Produto, Tanque, Turno } from '@/types'
import type { OrdemBacklogItem } from '@/app/api/backlog/route'
import type { OrdemBacklogEnvaseItem } from '@/app/api/backlog/envase/route'
import { BacklogTanques } from '@/components/calendario/BacklogTanques'
import { BacklogEnvase } from '@/components/calendario/BacklogEnvase'
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

const TURNO_COLORS = [
  { bg: '#EFF6FF', label: '#2563EB' },
  { bg: '#F0FDF4', label: '#16A34A' },
  { bg: '#FEF9C3', label: '#D97706' },
  { bg: '#FDF4FF', label: '#9333EA' },
] as const

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
  turnos,
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
  turnos: Turno[]
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const [outerWidth, setOuterWidth] = useState(0)
  const { setNodeRef, isOver } = useDroppable({ id: `board:${maquina.id}` })
  const { pxPerMinute } = getCalendarMetrics(viewMode, zoomIndex)
  const HORA_COL = 64
  const hourHeight = 60 * pxPerMinute
  const totalMinutes = Math.max(60, (janela.endHour - janela.startHour) * 60)
  const boardHeight = totalMinutes * pxPerMinute
  const fallbackColWidth = viewMode === 'dia' ? 760 : 220
  const dynamicColumnWidth =
    outerWidth > HORA_COL + 80
      ? Math.max(100, (outerWidth - HORA_COL) / dias.length)
      : fallbackColWidth
  const boardWidth = dynamicColumnWidth * dias.length

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setOuterWidth(e.contentRect.width))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const hourMarks = useMemo(() => {
    const marks: number[] = []
    for (let h = janela.startHour; h <= janela.endHour; h++) marks.push(h)
    return marks
  }, [janela])

  const now = new Date()
  const todayIdx = dias.findIndex((d) => formatYmd(d) === formatYmd(now))
  const currentTimeMin = now.getHours() * 60 + now.getMinutes() - janela.startHour * 60
  const showNow = todayIdx >= 0 && currentTimeMin >= 0 && currentTimeMin <= totalMinutes
  const turnosAtivos = turnos.filter((t) => t.ativo)

  return (
    <div ref={outerRef} className="flex min-w-0 flex-col overflow-x-auto">
      {/* Sticky header: dias + legenda de turnos */}
      <div className="sticky top-0 z-30 border-b-2 border-[#E4E7EC] bg-white shadow-sm">
        {/* Linha dos dias */}
        <div className="flex">
          <div className="w-16 shrink-0 border-r border-[#E4E7EC] bg-[#F7F8FA]" />
          {dias.map((dia) => {
            const isHoje = formatYmd(dia) === formatYmd(now)
            return (
              <div
                key={formatYmd(dia)}
                className={`shrink-0 border-r border-[#E4E7EC] px-3 py-2 ${isHoje ? 'bg-[#EFF6FF]' : ''}`}
                style={{ width: dynamicColumnWidth }}
              >
                <div
                  className={`text-[10px] font-semibold uppercase tracking-widest ${isHoje ? 'text-[#2563EB]' : 'text-[#9CA3AF]'}`}
                >
                  {format(dia, 'EEE', { locale: ptBR })}
                </div>
                <div
                  className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base font-bold ${
                    isHoje ? 'bg-[#2563EB] text-white' : 'text-[#111827]'
                  }`}
                >
                  {format(dia, 'dd')}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legenda de turnos */}
        {turnosAtivos.length > 0 && (
          <div className="flex items-center border-t border-[#E4E7EC] bg-[#F7F8FA]">
            <div className="w-16 shrink-0 border-r border-[#E4E7EC] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#9CA3AF]">
              Turnos
            </div>
            <div className="flex flex-wrap gap-1.5 px-3 py-1.5">
              {turnosAtivos.map((turno, i) => {
                const cor = TURNO_COLORS[i % TURNO_COLORS.length]
                const iH = Math.floor(turno.hora_inicio / 60)
                const iM = turno.hora_inicio % 60
                const fH = Math.floor(turno.hora_fim / 60)
                const fM = turno.hora_fim % 60
                return (
                  <div
                    key={turno.id}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 py-1"
                    style={{ backgroundColor: cor.bg }}
                  >
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cor.label }} />
                    <span className="text-[11px] font-semibold" style={{ color: cor.label }}>
                      {turno.nome}
                    </span>
                    <span className="font-mono text-[10px] text-[#6B7280]">
                      {`${String(iH).padStart(2, '0')}:${String(iM).padStart(2, '0')} – ${String(fH).padStart(2, '0')}:${String(fM).padStart(2, '0')}`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Grid body */}
      <div className="flex">
        {/* Coluna de horas */}
        <div
          className="relative sticky left-0 z-20 w-16 shrink-0 border-r border-[#E4E7EC] bg-white"
          style={{ height: boardHeight }}
        >
          {hourMarks.map((hour) => (
            <div
              key={hour}
              className="absolute right-0 -translate-y-2.5 pr-2"
              style={{ top: (hour - janela.startHour) * hourHeight }}
            >
              <span className="font-mono text-[11px] text-[#9CA3AF]">
                {String(hour).padStart(2, '0')}h
              </span>
            </div>
          ))}
        </div>

        {/* Área do board */}
        <div
          ref={(node) => {
            setNodeRef(node)
            boardRef(node)
          }}
          className={`relative transition-colors ${isOver ? 'bg-[#EFF6FF]/30' : ''}`}
          style={{ width: boardWidth, height: boardHeight }}
        >
          {/* Colunas de dia — fundo + bandas de turno + linhas de hora */}
          {dias.map((dia, dayIndex) => {
            const isHoje = formatYmd(dia) === formatYmd(now)
            return (
              <div
                key={formatYmd(dia)}
                className="absolute inset-y-0 border-r border-[#E4E7EC]"
                style={{
                  left: dayIndex * dynamicColumnWidth,
                  width: dynamicColumnWidth,
                  backgroundColor: isHoje ? '#FAFCFF' : '#FFFFFF',
                }}
              >
                {/* Linhas de hora */}
                {hourMarks.map((hour) => (
                  <div
                    key={hour}
                    className={`absolute inset-x-0 border-t ${
                      hour === janela.startHour ? 'border-[#CDD2DA]' : 'border-[#F0F2F5]'
                    }`}
                    style={{ top: (hour - janela.startHour) * hourHeight }}
                  />
                ))}

                {/* Bandas de turno */}
                {turnosAtivos.map((turno, i) => {
                  const cor = TURNO_COLORS[i % TURNO_COLORS.length]
                  const startMin = turno.hora_inicio - janela.startHour * 60
                  const endMin = turno.hora_fim - janela.startHour * 60
                  const top = Math.max(0, startMin) * pxPerMinute
                  const bot = Math.min(totalMinutes, endMin) * pxPerMinute
                  if (top >= bot) return null
                  return (
                    <div
                      key={turno.id}
                      className="pointer-events-none absolute inset-x-0"
                      style={{ top, height: bot - top, backgroundColor: cor.bg, opacity: 0.55 }}
                    />
                  )
                })}
              </div>
            )
          })}

          {/* Indicador de hora atual */}
          {showNow && (
            <div
              className="pointer-events-none absolute z-20"
              style={{
                top: currentTimeMin * pxPerMinute,
                left: todayIdx * dynamicColumnWidth,
                width: dynamicColumnWidth,
              }}
            >
              <div className="relative flex items-center">
                <div className="absolute -left-1.5 h-3 w-3 rounded-full bg-[#EF4444]" />
                <div className="w-full border-t-2 border-[#EF4444]" />
              </div>
            </div>
          )}

          {/* Ordens agendadas */}
          {ordens.map((ordem) => (
            <VerticalScheduledEvent
              key={ordem.id}
              ordem={ordem}
              rangeStart={rangeStart}
              dias={dias}
              janela={janela}
              columnWidth={dynamicColumnWidth}
              pxPerMinute={pxPerMinute}
              onRemove={onRemove}
              onOpen={onOpenOrder}
              onEdit={(ordemId, inicio, fim) => onEdit(ordemId, maquina.id, inicio, fim)}
            />
          ))}

          {/* Estado vazio */}
          {ordens.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-[12px] border border-dashed border-[#E4E7EC] bg-white/90 px-8 py-6 text-center shadow-sm">
                <CalendarClock size={20} className="mx-auto mb-2 text-[#CDD2DA]" />
                <div className="text-[13px] font-medium text-[#9CA3AF]">Arraste uma ordem do backlog</div>
                <div className="text-[11px] text-[#CDD2DA]">para montar a agenda deste recurso</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-30 border-t border-[#E4E7EC] bg-[#F7F8FA] px-4 py-1.5 text-[11px] text-[#9CA3AF]">
        Zoom {zoomLabel} · encaixe de {janela.snapMinutes} min · turno detectado automaticamente ao soltar
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

  const isInProduction = ordem.planning_status === 'IN_PRODUCTION'
  const isCompact = height < 72
  const isTiny = height < 46

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
      className={`group absolute overflow-hidden rounded-[10px] border transition-all duration-150 hover:z-30 select-none ${
        editing
          ? 'z-40 cursor-grabbing shadow-lg'
          : 'cursor-pointer hover:shadow-md'
      }`}
      style={{
        top, left, width, height,
        backgroundColor: `${color}14`,
        borderColor: editing ? color : `${color}50`,
        boxShadow: editing ? `0 0 0 2px ${color}40, 0 8px 24px ${color}20` : undefined,
      }}
      title={`${ordemLabel(ordem)}\n${formatarHora(inicio)} – ${formatarHora(fim)}`}
    >
      {/* Faixa esquerda colorida */}
      <div
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-[10px]"
        style={{ backgroundColor: color }}
      />

      {/* Handle resize topo */}
      <div
        className="absolute inset-x-0 top-0 z-10 h-2.5 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: `linear-gradient(to bottom, ${color}30, transparent)` }}
        onPointerDown={(e) => handlePointerDown(e, 'resize-start')}
        title="Ajustar início"
      />
      {/* Handle resize baixo */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 h-2.5 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: `linear-gradient(to top, ${color}30, transparent)` }}
        onPointerDown={(e) => handlePointerDown(e, 'resize-end')}
        title="Ajustar fim"
      />

      {/* Conteúdo */}
      <div className="flex h-full min-h-0 flex-col pl-3 pr-2 py-2">
        {isTiny ? (
          /* Modo ultra-compacto: tudo em uma linha */
          <div className="flex items-center gap-1.5 overflow-hidden">
            {isInProduction && (
              <span className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" style={{ backgroundColor: color }} />
            )}
            <span className="truncate text-[11px] font-semibold leading-none" style={{ color }}>
              {formatarHora(inicio)}
            </span>
            <span className="truncate text-[11px] font-semibold leading-none text-[#111827]">
              {ordemLabel(ordem)}
            </span>
          </div>
        ) : isCompact ? (
          /* Modo compacto: título + horário */
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-0.5">
            <div className="flex items-center gap-1.5">
              {isInProduction && (
                <span className="inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" style={{ backgroundColor: color }} />
              )}
              <span className="truncate text-[12px] font-semibold leading-tight text-[#111827]">
                {ordemLabel(ordem)}
              </span>
            </div>
            <span className="font-mono text-[10px] leading-none" style={{ color }}>
              {formatarHora(inicio)} – {formatarHora(fim)}
            </span>
          </div>
        ) : (
          /* Modo completo */
          <>
            <div className="flex min-w-0 items-start justify-between gap-1">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {isInProduction && (
                    <span className="inline-flex h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ backgroundColor: color }} />
                  )}
                  <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-[#111827]">
                    {ordemLabel(ordem)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <span className="font-mono text-[11px] font-medium" style={{ color }}>
                    {formatarHora(inicio)} – {formatarHora(fim)}
                  </span>
                  <span className="text-[10px] text-[#9CA3AF]">·</span>
                  <span className="font-mono text-[10px] text-[#9CA3AF]">{formatarDuracao(duration)}</span>
                </div>
              </div>
              {/* Botão remover — aparece só no hover */}
              <button
                type="button"
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-transparent transition-all group-hover:bg-white/80 group-hover:text-[#9CA3AF] group-hover:shadow-sm hover:!text-[#DC2626]"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(ordem.id)
                }}
                title="Desagendar"
              >
                <X size={12} />
              </button>
            </div>

            {/* Rodapé com badges */}
            <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
              <span
                className="rounded-[5px] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-white"
                style={{ backgroundColor: color }}
              >
                {ordem.numero_externo.slice(-8)}
              </span>
              <span className="rounded-[5px] bg-white/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#6B7280]">
                {ordem.etapa}
              </span>
              {isInProduction && (
                <span className="rounded-[5px] bg-white/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#16A34A]">
                  produzindo
                </span>
              )}
              {ordem.lote && (
                <span className="truncate rounded-[5px] bg-white/60 px-1.5 py-0.5 text-[10px] text-[#9CA3AF]">
                  {ordem.lote}
                </span>
              )}
            </div>
          </>
        )}
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

type ScheduleDropState = {
  ordemId: string
  tankId: string
  inicio: Date
  ordemBacklog: OrdemBacklogItem | null
}

type TanqueOrdemDetail = {
  id: string
  numero_externo: string
  tanque: string | null
  tank_id: string | null
  quantidade: number
  unidade: string
  data_prevista: string | null
  planning_status: string
  production_time_minutes: number | null
  cleaning_time_minutes: number | null
  total_duration_minutes: number | null
  inicio_agendado: string | null
  fim_calculado: string | null
  ordens_pedidos_erp: {
    id: string
    numero_pedido: string
    produto_descricao: string
    quantidade: number
    total_litros: number
  }[]
  agendamentos_producao: {
    id: string
    tank_id: string | null
    data_agendamento: string | null
    turno_id: string | null
  }[]
}

function ScheduleTanqueModal({
  scheduleDrop,
  turnos,
  onClose,
  onConfirm,
}: {
  scheduleDrop: ScheduleDropState
  turnos: Turno[]
  onClose: () => void
  onConfirm: (ordemId: string, tankId: string, inicio: Date) => Promise<void>
}) {
  const { ordemBacklog } = scheduleDrop
  const duracao = ordemBacklog?.total_duration_minutes ?? 60
  const [date, setDate] = useState(formatYmd(scheduleDrop.inicio))
  const [time, setTime] = useState(format(scheduleDrop.inicio, 'HH:mm'))
  const [saving, setSaving] = useState(false)

  const inicio = useMemo(() => {
    const d = new Date(`${date}T${time}:00`)
    return Number.isFinite(d.getTime()) ? d : scheduleDrop.inicio
  }, [date, time, scheduleDrop.inicio])

  const fim = useMemo(() => new Date(inicio.getTime() + duracao * 60000), [inicio, duracao])

  const turnosAtivos = useMemo(() => turnos.filter((t) => t.ativo), [turnos])
  const turno = useMemo(() => {
    const minutosDia = inicio.getHours() * 60 + inicio.getMinutes()
    return turnosAtivos.find((t) => minutosDia >= t.hora_inicio && minutosDia < t.hora_fim) ?? null
  }, [inicio, turnosAtivos])

  const turnoIdx = turno ? turnosAtivos.findIndex((t) => t.id === turno.id) : -1
  const turnoCor = turnoIdx >= 0 ? TURNO_COLORS[turnoIdx % TURNO_COLORS.length] : null

  async function confirmar() {
    setSaving(true)
    try {
      await onConfirm(scheduleDrop.ordemId, scheduleDrop.tankId, inicio)
    } finally {
      setSaving(false)
    }
  }

  const nome = ordemBacklog?.tanque ?? ordemBacklog?.numero_externo ?? 'Ordem'
  const pedidosCount = ordemBacklog?.pedidos_count ?? 0

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 p-4">
      <div className="w-full max-w-md rounded-[12px] border border-[#E4E7EC] bg-white shadow-[var(--shadow-md)]">
        <div className="border-b border-[#E4E7EC] px-5 py-4">
          <h2 className="text-base font-semibold text-[#111827]">Agendar no Tanque</h2>
          <p className="mt-0.5 truncate text-sm text-[#9CA3AF]">{nome}</p>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            {ordemBacklog?.quantidade && (
              <span className="rounded-[6px] bg-[#EFF6FF] px-2 py-1 text-[12px] font-medium text-[#2563EB]">
                {ordemBacklog.quantidade} {ordemBacklog.unidade}
              </span>
            )}
            {pedidosCount > 0 && (
              <span className="rounded-[6px] bg-[#F0F2F5] px-2 py-1 text-[12px] font-medium text-[#4B5563]">
                {pedidosCount} pedido{pedidosCount !== 1 ? 's' : ''}
              </span>
            )}
            <span className="rounded-[6px] bg-[#F0F2F5] px-2 py-1 text-[12px] font-medium text-[#4B5563]">
              {duracao} min total
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 text-sm text-[#111827]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Início</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-9 w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 text-sm text-[#111827]"
              />
            </div>
          </div>

          <div className="rounded-[8px] border border-[#E4E7EC] bg-[#F7F8FA] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Previsão de horário</div>
            <div className="mt-2 flex items-center gap-3">
              <div>
                <div className="text-[10px] text-[#9CA3AF]">Início</div>
                <div className="font-mono text-[16px] font-bold text-[#111827]">{format(inicio, 'HH:mm')}</div>
              </div>
              <div className="text-lg text-[#CDD2DA]">→</div>
              <div>
                <div className="text-[10px] text-[#9CA3AF]">Fim estimado</div>
                <div className="font-mono text-[16px] font-bold text-[#111827]">{format(fim, 'HH:mm')}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[10px] text-[#9CA3AF]">Duração</div>
                <div className="font-mono text-[13px] font-semibold text-[#4B5563]">{duracao} min</div>
              </div>
            </div>
            {turno && turnoCor ? (
              <div className="mt-2.5 flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: turnoCor.label }} />
                <span className="text-[12px] font-medium" style={{ color: turnoCor.label }}>
                  Turno: {turno.nome}
                </span>
              </div>
            ) : (
              <div className="mt-2.5 text-[12px] text-[#F59E0B]">
                Fora de turno cadastrado — será registrado como Manual
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#E4E7EC] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-[8px] border border-[#CDD2DA] bg-white px-4 py-2 text-sm font-medium text-[#4B5563] hover:bg-[#F7F8FA]"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={saving}
            className="rounded-[8px] bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {saving ? 'Agendando...' : 'Confirmar agendamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TanqueDetailModal({
  ordemId,
  turnos,
  tanques,
  onClose,
}: {
  ordemId: string
  turnos: Turno[]
  tanques: Tanque[]
  onClose: () => void
}) {
  const [ordem, setOrdem] = useState<TanqueOrdemDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    setLoading(true)
    setErro(false)
    fetch(`/api/producao/ordens/${ordemId}`)
      .then((r) => {
        if (!r.ok) throw new Error('not ok')
        return r.json()
      })
      .then((data) => {
        if (data?.id) setOrdem(data)
        else setErro(true)
      })
      .catch(() => setErro(true))
      .finally(() => setLoading(false))
  }, [ordemId])

  const turnosAtivos = useMemo(() => turnos.filter((t) => t.ativo), [turnos])

  const turno = useMemo(() => {
    if (!ordem?.inicio_agendado) return null
    const inicio = new Date(ordem.inicio_agendado)
    const minutosDia = inicio.getHours() * 60 + inicio.getMinutes()
    return turnosAtivos.find((t) => minutosDia >= t.hora_inicio && minutosDia < t.hora_fim) ?? null
  }, [ordem, turnosAtivos])

  const turnoIdx = turno ? turnosAtivos.findIndex((t) => t.id === turno.id) : -1
  const turnoCor = turnoIdx >= 0 ? TURNO_COLORS[turnoIdx % TURNO_COLORS.length] : null
  const tanque = tanques.find((t) => t.id === ordem?.tank_id)
  const pedidos = ordem?.ordens_pedidos_erp ?? []
  const totalLitrosPedidos = pedidos.reduce((acc, p) => acc + Number(p.total_litros ?? 0), 0)
  const totalUnidadesPedidos = pedidos.reduce((acc, p) => acc + Number(p.quantidade ?? 0), 0)

  const STATUS_MAP: Record<string, { label: string; dot: string; bg: string; text: string }> = {
    BACKLOG:       { label: 'Backlog',      dot: '#9CA3AF', bg: '#F0F2F5', text: '#4B5563' },
    SCHEDULED:     { label: 'Agendado',     dot: '#2563EB', bg: '#EFF6FF', text: '#2563EB' },
    IN_PRODUCTION: { label: 'Em Produção',  dot: '#16A34A', bg: '#F0FDF4', text: '#16A34A' },
    COMPLETED:     { label: 'Concluído',    dot: '#15803D', bg: '#DCFCE7', text: '#15803D' },
    CANCELED:      { label: 'Cancelado',    dot: '#DC2626', bg: '#FEF2F2', text: '#DC2626' },
  }
  const statusCfg = STATUS_MAP[ordem?.planning_status ?? ''] ?? {
    label: ordem?.planning_status ?? '—', dot: '#9CA3AF', bg: '#F0F2F5', text: '#4B5563'
  }

  const duracaoSoma = (ordem?.production_time_minutes ?? 0) + (ordem?.cleaning_time_minutes ?? 0)
  const duracaoTotal = (ordem?.total_duration_minutes ?? duracaoSoma) || null

  const producaoPct = duracaoTotal && ordem?.production_time_minutes
    ? Math.round((ordem.production_time_minutes / duracaoTotal) * 100)
    : null
  const limpezaPct = duracaoTotal && ordem?.cleaning_time_minutes
    ? Math.round((ordem.cleaning_time_minutes / duracaoTotal) * 100)
    : null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-[16px] border border-[#E4E7EC] bg-white shadow-2xl"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header com gradiente */}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#1E3A5F] to-[#2563EB] px-5 pt-5 pb-4">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full bg-white/15 text-white/80 transition hover:bg-white/25 hover:text-white"
          >
            <X size={14} />
          </button>

          {loading ? (
            <div className="h-14" />
          ) : !ordem || erro ? null : (
            <>
              {/* Status badge */}
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ backgroundColor: statusCfg.bg, color: statusCfg.text }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusCfg.dot }} />
                  {statusCfg.label}
                </span>
                {turno && turnoCor && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ backgroundColor: turnoCor.bg, color: turnoCor.label }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: turnoCor.label }} />
                    {turno.nome}
                  </span>
                )}
              </div>

              {/* Título */}
              <h2 className="text-[18px] font-bold leading-tight text-white">
                {ordem.tanque || ordem.numero_externo || 'Ordem de Produção'}
              </h2>
              <p className="mt-0.5 font-mono text-[12px] text-white/60">
                #{ordem.numero_externo}
              </p>

              {/* Horário em destaque */}
              {ordem.inicio_agendado && ordem.fim_calculado && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="rounded-[8px] bg-white/15 px-3 py-1.5">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-white/60">Início</div>
                    <div className="font-mono text-[15px] font-bold text-white">
                      {format(new Date(ordem.inicio_agendado), 'HH:mm')}
                    </div>
                  </div>
                  <div className="text-white/40">→</div>
                  <div className="rounded-[8px] bg-white/15 px-3 py-1.5">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-white/60">Fim</div>
                    <div className="font-mono text-[15px] font-bold text-white">
                      {format(new Date(ordem.fim_calculado), 'HH:mm')}
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-white/60">Data</div>
                    <div className="font-mono text-[13px] font-semibold text-white">
                      {format(new Date(ordem.inicio_agendado), 'dd/MM/yyyy')}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Body scrollável */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-[#9CA3AF]">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#E4E7EC] border-t-[#2563EB]" />
              Carregando...
            </div>
          ) : erro || !ordem ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-[#9CA3AF]">
              <Package size={24} className="text-[#E4E7EC]" />
              Não foi possível carregar os dados da ordem.
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-[#F0F2F5]">
              {/* Resumo rápido */}
              <div className="grid grid-cols-3 divide-x divide-[#F0F2F5]">
                <div className="px-4 py-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Tanque</div>
                  <div className="mt-1 text-[13px] font-semibold text-[#111827]">{tanque?.nome ?? '—'}</div>
                </div>
                <div className="px-4 py-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Volume</div>
                  <div className="mt-1 font-mono text-[13px] font-semibold text-[#111827]">
                    {Number(ordem.quantidade).toLocaleString('pt-BR')} {ordem.unidade}
                  </div>
                </div>
                <div className="px-4 py-3 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Pedidos</div>
                  <div className="mt-1 text-[13px] font-semibold text-[#111827]">{pedidos.length}</div>
                </div>
              </div>

              {/* Tempos de produção */}
              {duracaoTotal != null && (
                <div className="px-5 py-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Tempos</span>
                    <span className="font-mono text-[12px] font-semibold text-[#2563EB]">{duracaoTotal} min total</span>
                  </div>

                  {/* Barra de progresso dos tempos */}
                  {producaoPct !== null && (
                    <div className="mb-3 overflow-hidden rounded-full bg-[#F0F2F5]" style={{ height: 6 }}>
                      <div className="flex h-full">
                        <div className="bg-[#2563EB]" style={{ width: `${producaoPct}%` }} />
                        {limpezaPct !== null && (
                          <div className="bg-[#93C5FD]" style={{ width: `${limpezaPct}%` }} />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    {ordem.production_time_minutes != null && (
                      <div className="rounded-[8px] bg-[#EFF6FF] p-3 text-center">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-[#93C5FD]">Produção</div>
                        <div className="mt-1 font-mono text-[16px] font-bold text-[#2563EB]">
                          {ordem.production_time_minutes}
                        </div>
                        <div className="text-[10px] text-[#93C5FD]">min</div>
                      </div>
                    )}
                    {ordem.cleaning_time_minutes != null && (
                      <div className="rounded-[8px] bg-[#F0F2F5] p-3 text-center">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-[#9CA3AF]">Limpeza</div>
                        <div className="mt-1 font-mono text-[16px] font-bold text-[#4B5563]">
                          {ordem.cleaning_time_minutes}
                        </div>
                        <div className="text-[10px] text-[#9CA3AF]">min</div>
                      </div>
                    )}
                    <div className="rounded-[8px] bg-[#111827] p-3 text-center">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-white/50">Total</div>
                      <div className="mt-1 font-mono text-[16px] font-bold text-white">{duracaoTotal}</div>
                      <div className="text-[10px] text-white/50">min</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pedidos vinculados */}
              <div className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                    Pedidos vinculados
                  </span>
                  {pedidos.length > 0 && (
                    <span className="font-mono text-[11px] text-[#9CA3AF]">
                      {totalLitrosPedidos.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L ·{' '}
                      {totalUnidadesPedidos.toLocaleString('pt-BR')} un
                    </span>
                  )}
                </div>

                {pedidos.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-[#E4E7EC] p-6 text-center text-[13px] text-[#9CA3AF]">
                    Nenhum pedido vinculado
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[10px] border border-[#E4E7EC]">
                    {/* Cabeçalho */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-[#E4E7EC] bg-[#F7F8FA] px-3 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">Produto</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">Pedido</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">Qtd</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">Litros</span>
                    </div>
                    {/* Linhas */}
                    <div className="max-h-56 divide-y divide-[#F0F2F5] overflow-y-auto">
                      {pedidos.map((p, idx) => (
                        <div
                          key={p.id}
                          className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2.5 ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'
                          }`}
                        >
                          <span className="truncate text-[12px] font-medium text-[#111827]" title={p.produto_descricao}>
                            {p.produto_descricao}
                          </span>
                          <span className="whitespace-nowrap font-mono text-[11px] text-[#6B7280]">
                            #{p.numero_pedido}
                          </span>
                          <span className="whitespace-nowrap font-mono text-[12px] font-semibold text-[#111827]">
                            {Number(p.quantidade).toLocaleString('pt-BR')}
                          </span>
                          <span className="whitespace-nowrap font-mono text-[12px] font-semibold text-[#2563EB]">
                            {Number(p.total_litros).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}L
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Rodapé com total */}
                    {pedidos.length > 1 && (
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-t border-[#E4E7EC] bg-[#F7F8FA] px-3 py-2">
                        <span className="text-[11px] font-semibold text-[#4B5563]">Total</span>
                        <span />
                        <span className="font-mono text-[12px] font-bold text-[#111827]">
                          {totalUnidadesPedidos.toLocaleString('pt-BR')}
                        </span>
                        <span className="font-mono text-[12px] font-bold text-[#2563EB]">
                          {totalLitrosPedidos.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}L
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !erro && ordem && (
          <div className="shrink-0 border-t border-[#E4E7EC] bg-[#F7F8FA] px-5 py-3">
            <button
              onClick={onClose}
              className="w-full rounded-[10px] bg-white px-4 py-2.5 text-sm font-semibold text-[#4B5563] shadow-sm ring-1 ring-[#E4E7EC] transition hover:bg-[#F0F2F5]"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CalendarioPage() {
  const [diaBase, setDiaBase] = useState<Date>(() => new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('semana')
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [ordensBacklogTanque, setOrdensBacklogTanque] = useState<OrdemBacklogItem[]>([])
  const [ordensBacklogEnvase, setOrdensBacklogEnvase] = useState<OrdemBacklogEnvaseItem[]>([])
  const [backlogLoading, setBacklogLoading] = useState(false)
  const [backlogEnvaseLoading, setBacklogEnvaseLoading] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [novaOrdemAberta, setNovaOrdemAberta] = useState(false)
  const [janela, setJanela] = useState<JanelaProducao>(DEFAULT_JANELA_PRODUCAO)
  const [zoomIndex, setZoomIndex] = useState(1)
  const [buscaEnvase, setBuscaEnvase] = useState('')
  const [activePayload, setActivePayload] = useState<DragPayload | null>(null)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [configOrder, setConfigOrder] = useState<Ordem | null>(null)
  const [scheduleDrop, setScheduleDrop] = useState<ScheduleDropState | null>(null)
  const [tanqueDetailOrdemId, setTanqueDetailOrdemId] = useState<string | null>(null)
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

  const carregarBacklog = useCallback(async () => {
    setBacklogLoading(true)
    try {
      const data = await fetch('/api/backlog').then((r) => r.json())
      setOrdensBacklogTanque(Array.isArray(data) ? data : [])
    } catch {
      // silencioso — backlog continua com dados anteriores
    } finally {
      setBacklogLoading(false)
    }
  }, [])

  const carregarBacklogEnvase = useCallback(async () => {
    setBacklogEnvaseLoading(true)
    try {
      const data = await fetch('/api/backlog/envase').then((r) => r.json())
      setOrdensBacklogEnvase(Array.isArray(data) ? data : [])
    } catch {
      // silencioso
    } finally {
      setBacklogEnvaseLoading(false)
    }
  }, [])

  const carregarDados = useCallback(async () => {
    try {
      setMensagem('')
      const [m, tn, tu, o, p] = await Promise.all([
        fetch('/api/maquinas').then((r) => r.json()),
        fetch('/api/tanques').then((r) => r.json()),
        fetch('/api/turnos').then((r) => r.json()),
        fetch(`/api/ordens?inicio=${inicioYmd}&fim=${fimYmd}`).then((r) => r.json()),
        fetch('/api/produtos').then((r) => r.json()),
      ])

      setMaquinas(Array.isArray(m) ? m : [])
      setTanques(Array.isArray(tn) ? tn : [])
      setTurnos(Array.isArray(tu) ? tu : [])
      setOrdens(Array.isArray(o) ? o : [])
      setProdutos(Array.isArray(p) ? p : [])

      if (o?.error) setMensagem(o.error)
    } catch {
      setMensagem('Erro ao carregar calendario de producao.')
    }
  }, [inicioYmd, fimYmd])

  const carregarTudo = useCallback(async () => {
    await Promise.all([carregarDados(), carregarBacklog(), carregarBacklogEnvase()])
  }, [carregarDados, carregarBacklog, carregarBacklogEnvase])

  useEffect(() => {
    carregarTudo()
  }, [carregarTudo])

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
    const termo = normalizarBusca(buscaEnvase)
    return ordensAtivas
      .filter((o) => ordemPlanningStatus(o) === 'BACKLOG')
      .filter((o) => o.etapa === 'envase')
      .filter((o) => {
        if (!termo) return true
        return [o.produto?.nome, o.produto_sku, o.numero_externo, o.lote, o.tanque]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(termo))
      })
  }, [ordensAtivas, buscaEnvase])

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
      await carregarTudo()
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
    const actualColumnWidth = isBoardDrop
      ? row.getBoundingClientRect().width / range.dias.length
      : dayWidth
    const inicio = snapDate(
      isBoardDrop
        ? positionToCalendarDate(x, y, range.inicio, janela, actualColumnWidth, calendarMetrics.pxPerMinute, range.dias.length)
        : positionToDate(x, range.inicio, janela, dayWidth, pxPerMinute),
      janela.snapMinutes
    )

    if (resourceTab === 'tanque' && payload.type === 'backlog') {
      const ordemBacklog = ordensBacklogTanque.find((o) => o.id === payload.ordemId) ?? null
      setScheduleDrop({ ordemId: payload.ordemId, tankId: maquinaId, inicio, ordemBacklog })
    } else {
      await salvarAgenda(payload.ordemId, maquinaId, inicio)
    }
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
    await carregarTudo()
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

    await carregarTudo()
  }

  function encontrarTurno(hora: Date): Turno | null {
    const minutosDia = hora.getHours() * 60 + hora.getMinutes()
    return turnos.find((t) => t.ativo && minutosDia >= t.hora_inicio && minutosDia < t.hora_fim) ?? null
  }

  async function agendarTanque(ordemId: string, tankId: string, inicio: Date) {
    const ordemBacklog = ordensBacklogTanque.find((o) => o.id === ordemId)
    const duracao = ordemBacklog?.total_duration_minutes ?? 60
    const fim = calcularFim(inicio, duracao)

    const turno = encontrarTurno(inicio)
    const turnoId = turno?.id ?? 'manual'
    const turnoNome = turno?.nome ?? 'Manual'
    const dataAgendamento = format(inicio, 'yyyy-MM-dd')

    const producaoMin =
      ordemBacklog?.production_time_minutes ??
      ordemBacklog?.total_duration_minutes ??
      duracao

    const agendRes = await fetch('/api/producao/agendamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ordem_id: ordemId,
        tank_id: tankId,
        turno_id: turnoId,
        turno_nome: turnoNome,
        data_agendamento: dataAgendamento,
        inicio_agendado: inicio.toISOString(),
        fim_calculado: fim.toISOString(),
        production_time_minutes: producaoMin,
        cleaning_time_minutes: ordemBacklog?.cleaning_time_minutes ?? null,
      }),
    })

    if (!agendRes.ok) {
      const data = await agendRes.json().catch(() => ({}))
      setMensagem(data.error ?? 'Erro ao criar agendamento no tanque.')
      await carregarTudo()
      return
    }

    await carregarTudo()
  }

  async function desagendar(ordemId: string) {
    const ordem = ordens.find((o) => o.id === ordemId)
    const isTanque = ordem?.etapa === 'tanque' || resourceTab === 'tanque'

    if (isTanque) {
      const agendRes = await fetch(`/api/producao/agendamentos?ordem_id=${ordemId}`)
      if (agendRes.ok) {
        const agendamento = await agendRes.json()
        if (agendamento?.id) {
          const deleteRes = await fetch(`/api/producao/agendamentos?id=${agendamento.id}`, { method: 'DELETE' })
          if (!deleteRes.ok) {
            const data = await deleteRes.json().catch(() => ({}))
            setMensagem(data.error ?? 'Erro ao remover agendamento do tanque.')
            return
          }
          await fetch('/api/ordens', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: ordemId, inicio_agendado: null, fim_calculado: null }),
          })
          await carregarTudo()
          return
        }
      }
    }

    const result = await patchAgenda(ordemId, null, null)
    if (!result.ok) {
      setMensagem(result.error ?? 'Nao foi possivel desagendar.')
      return
    }
    await carregarTudo()
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
          <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-[12px] border border-[#E4E7EC] bg-white">
            <div className="flex items-center justify-between border-b border-[#E4E7EC] px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                {resourceTab === 'tanque' ? 'Tanques' : 'Envase'}
              </span>
              <button
                onClick={() => setNovaOrdemAberta(true)}
                className="grid h-7 w-7 place-items-center rounded-full bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                title="Nova ordem no Planejamento do Tanque"
              >
                <Plus size={16} />
              </button>
            </div>
            {resourceTab === 'tanque' ? (
              <BacklogTanques ordens={ordensBacklogTanque} loading={backlogLoading} />
            ) : (
              <BacklogEnvase ordens={ordensBacklogEnvase} loading={backlogEnvaseLoading} />
            )}
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
                    turnos={turnos}
                    boardRef={(node) => {
                      rowRefs.current[selectedMachine.id] = node
                    }}
                    onRemove={desagendar}
                    onOpenOrder={resourceTab === 'tanque' ? (ordem) => setTanqueDetailOrdemId(ordem.id) : setConfigOrder}
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

        {scheduleDrop && (
          <ScheduleTanqueModal
            scheduleDrop={scheduleDrop}
            turnos={turnos}
            onClose={() => setScheduleDrop(null)}
            onConfirm={async (ordemId, tankId, inicio) => {
              setScheduleDrop(null)
              await agendarTanque(ordemId, tankId, inicio)
            }}
          />
        )}

        {tanqueDetailOrdemId && (
          <TanqueDetailModal
            ordemId={tanqueDetailOrdemId}
            turnos={turnos}
            tanques={tanques}
            onClose={() => setTanqueDetailOrdemId(null)}
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
