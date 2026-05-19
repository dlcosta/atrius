'use client'

import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  AlertTriangle,
  ArrowDownUp,
  CalendarDays,
  Clock,
  Droplets,
  Layers,
  Package,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react'
import type { OrdemBacklogItem } from '@/app/api/backlog/route'

type FiltroOrdem = 'pendentes' | 'maior_volume' | 'menor_volume' | 'data_proxima'

type Props = {
  ordens: OrdemBacklogItem[]
  loading?: boolean
}

function formatarDuracao(minutos: number | null): string {
  if (!minutos || minutos <= 0) return '—'
  const h = Math.floor(minutos / 60)
  const m = Math.round(minutos % 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function formatarData(data: string | null): string {
  if (!data) return ''
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

function isAtrasado(dataPrevista: string | null): boolean {
  if (!dataPrevista) return false
  return dataPrevista < new Date().toISOString().split('T')[0]
}

function isUrgente(dataPrevista: string | null): boolean {
  if (!dataPrevista) return false
  const hoje = new Date()
  const prevista = new Date(dataPrevista)
  const diasRestantes = Math.round((prevista.getTime() - hoje.getTime()) / 86400000)
  return diasRestantes >= 0 && diasRestantes <= 2
}

function normalizarBusca(v: string): string {
  return v.trim().toLowerCase()
}

function DraggableCard({ ordem }: { ordem: OrdemBacklogItem }) {
  const atrasado = isAtrasado(ordem.data_prevista)
  const urgente = isUrgente(ordem.data_prevista)
  const alerta = atrasado || urgente

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `backlog:${ordem.id}`,
    data: { type: 'backlog', ordemId: ordem.id },
  })

  const ocupacaoPercent =
    ordem.tank_volume_liters && ordem.tank_volume_liters > 0
      ? Math.min(100, Math.round((ordem.quantidade / ordem.tank_volume_liters) * 100))
      : null

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group relative cursor-grab select-none rounded-[10px] border bg-white transition-all duration-[120ms] active:cursor-grabbing ${
        isDragging ? 'opacity-40 shadow-2xl ring-2 ring-[#2563EB]' : 'hover:shadow-md'
      } ${
        atrasado
          ? 'border-red-200 hover:border-red-300'
          : urgente
          ? 'border-amber-200 hover:border-amber-300'
          : 'border-[#E4E7EC] hover:border-[#CDD2DA]'
      }`}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        borderLeft: `4px solid ${atrasado ? '#DC2626' : urgente ? '#D97706' : '#2563EB'}`,
      }}
    >
      {/* Header */}
      <div className="px-3 pt-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-snug text-[#111827]">
              {ordem.tanque ?? ordem.numero_externo}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[#9CA3AF]">
              #{ordem.numero_externo}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {alerta && (
              <span
                className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  atrasado ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                <AlertTriangle size={10} />
                {atrasado ? 'Atrasado' : 'Urgente'}
              </span>
            )}
            <span className="rounded-full bg-[#F0F2F5] px-2 py-0.5 text-[10px] font-medium uppercase text-[#4B5563]">
              Pendente
            </span>
          </div>
        </div>
      </div>

      {/* Volume */}
      <div className="mt-2 px-3">
        <div className="flex items-center gap-1.5">
          <Droplets size={13} className="shrink-0 text-[#2563EB]" />
          <span className="text-[13px] font-bold text-[#111827]">
            {ordem.quantidade.toLocaleString('pt-BR')} L
          </span>
          {ordem.tank_volume_liters && (
            <span className="text-[11px] text-[#9CA3AF]">/ {ordem.tank_volume_liters.toLocaleString('pt-BR')} L</span>
          )}
        </div>

        {ocupacaoPercent !== null && (
          <div className="mt-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0F2F5]">
              <div
                className={`h-full rounded-full ${
                  ocupacaoPercent > 90 ? 'bg-red-500' : ocupacaoPercent > 70 ? 'bg-amber-500' : 'bg-[#2563EB]'
                }`}
                style={{ width: `${ocupacaoPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-[#9CA3AF]">{ocupacaoPercent}% do tanque</span>
          </div>
        )}
      </div>

      {/* Tempos */}
      <div className="mt-2 grid grid-cols-3 gap-1 px-3">
        <div className="rounded-[6px] bg-[#F7F8FA] px-2 py-1 text-center">
          <div className="flex items-center justify-center gap-0.5 text-[10px] font-medium uppercase text-[#9CA3AF]">
            <Sparkles size={9} />
            Prod
          </div>
          <div className="font-mono text-[11px] font-semibold text-[#111827]">
            {formatarDuracao(ordem.production_time_minutes)}
          </div>
        </div>
        <div className="rounded-[6px] bg-[#F7F8FA] px-2 py-1 text-center">
          <div className="flex items-center justify-center gap-0.5 text-[10px] font-medium uppercase text-[#9CA3AF]">
            <Wrench size={9} />
            Limpeza
          </div>
          <div className="font-mono text-[11px] font-semibold text-[#111827]">
            {formatarDuracao(ordem.cleaning_time_minutes)}
          </div>
        </div>
        <div className="rounded-[6px] bg-[#EFF6FF] px-2 py-1 text-center">
          <div className="flex items-center justify-center gap-0.5 text-[10px] font-medium uppercase text-[#2563EB]">
            <Clock size={9} />
            Total
          </div>
          <div className="font-mono text-[11px] font-semibold text-[#2563EB]">
            {formatarDuracao(ordem.total_duration_minutes)}
          </div>
        </div>
      </div>

      {/* Footer: pedidos + data */}
      <div className="mt-2 flex items-center justify-between gap-2 rounded-b-[10px] border-t border-[#F0F2F5] bg-[#F7F8FA] px-3 py-2">
        <div className="flex items-center gap-1 text-[11px] text-[#4B5563]">
          <Package size={11} />
          <span className="font-medium">{ordem.pedidos_count}</span>
          <span className="text-[#9CA3AF]">{ordem.pedidos_count === 1 ? 'pedido' : 'pedidos'}</span>
        </div>

        {ordem.data_prevista && (
          <div
            className={`flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium ${
              atrasado
                ? 'bg-red-50 text-red-700'
                : urgente
                ? 'bg-amber-50 text-amber-700'
                : 'bg-white text-[#4B5563]'
            }`}
          >
            <CalendarDays size={10} />
            {formatarData(ordem.data_prevista)}
          </div>
        )}
      </div>

      {/* Pedidos tooltip on hover */}
      {ordem.pedidos.length > 0 && (
        <div className="pointer-events-none invisible absolute left-full top-0 z-50 ml-2 w-64 rounded-[10px] border border-[#E4E7EC] bg-white p-3 shadow-xl group-hover:visible">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Pedidos vinculados
          </div>
          <div className="space-y-1.5">
            {ordem.pedidos.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-2 text-[12px]">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-[#111827]">#{p.numero_pedido}</div>
                  <div className="truncate text-[#9CA3AF]">{p.produto_descricao}</div>
                </div>
                <span className="shrink-0 font-mono text-[#2563EB]">{p.total_litros.toLocaleString('pt-BR')}L</span>
              </div>
            ))}
            {ordem.pedidos.length > 5 && (
              <div className="text-[11px] text-[#9CA3AF]">+{ordem.pedidos.length - 5} pedidos...</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function BacklogTanques({ ordens, loading }: Props) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroOrdem>('pendentes')

  const ordensFiltradas = useMemo(() => {
    const termo = normalizarBusca(busca)

    let resultado = ordens.filter((o) => {
      if (!termo) return true
      return [o.tanque, o.numero_externo, o.tank_id, ...o.pedidos.map((p) => p.numero_pedido)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo))
    })

    if (filtro === 'maior_volume') {
      resultado = [...resultado].sort((a, b) => b.quantidade - a.quantidade)
    } else if (filtro === 'menor_volume') {
      resultado = [...resultado].sort((a, b) => a.quantidade - b.quantidade)
    } else if (filtro === 'data_proxima') {
      resultado = [...resultado].sort((a, b) => {
        if (!a.data_prevista) return 1
        if (!b.data_prevista) return -1
        return a.data_prevista.localeCompare(b.data_prevista)
      })
    }

    return resultado
  }, [ordens, busca, filtro])

  const atrasadosCount = useMemo(
    () => ordens.filter((o) => isAtrasado(o.data_prevista)).length,
    [ordens]
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#E4E7EC] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[#2563EB]" />
            <span className="text-sm font-semibold text-[#111827]">Backlog dos Tanques</span>
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#2563EB] px-1 text-[10px] font-medium text-white">
              {ordens.length}
            </span>
          </div>
          {atrasadosCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              <AlertTriangle size={10} />
              {atrasadosCount} atrasado{atrasadosCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Origem */}
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[#9CA3AF]">
          <span className="rounded-[4px] bg-[#EFF6FF] px-1.5 py-0.5 font-medium text-[#2563EB]">
            Planejamento do Tanque
          </span>
          <span>→ aguardando agendamento</span>
        </div>

        {/* Busca */}
        <div className="mt-2 flex h-8 items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-2 focus-within:border-[#2563EB]">
          <Search size={13} className="shrink-0 text-[#9CA3AF]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar categoria, pedido..."
            className="h-8 min-w-0 flex-1 text-[13px] text-[#111827] outline-none"
          />
        </div>

        {/* Filtros */}
        <div className="mt-2 flex items-center gap-1">
          <ArrowDownUp size={11} className="shrink-0 text-[#9CA3AF]" />
          {(
            [
              { value: 'pendentes', label: 'Pendentes' },
              { value: 'data_proxima', label: 'Data' },
              { value: 'maior_volume', label: '↑ Vol' },
              { value: 'menor_volume', label: '↓ Vol' },
            ] as { value: FiltroOrdem; label: string }[]
          ).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFiltro(value)}
              className={`h-6 rounded-full px-2 text-[11px] font-medium transition ${
                filtro === value
                  ? 'bg-[#2563EB] text-white'
                  : 'bg-[#F0F2F5] text-[#4B5563] hover:bg-[#E4E7EC]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-[10px] bg-[#F0F2F5]" />
            ))}
          </div>
        ) : ordensFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#E4E7EC] p-8 text-center">
            <Layers size={20} className="text-[#9CA3AF]" />
            <div className="text-[13px] font-medium text-[#4B5563]">
              {busca ? 'Nenhuma ordem encontrada' : 'Backlog vazio'}
            </div>
            <div className="text-[11px] text-[#9CA3AF]">
              {busca
                ? 'Tente outro termo de busca'
                : 'Crie ordens no Planejamento do Tanque para preencher o backlog'}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {ordensFiltradas.map((ordem) => (
              <DraggableCard key={ordem.id} ordem={ordem} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
