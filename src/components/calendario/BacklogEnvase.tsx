'use client'

import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  AlertTriangle,
  ArrowDownUp,
  CalendarDays,
  Clock,
  Droplets,
  FlaskConical,
  Package,
  Search,
  Sparkles,
  Wrench,
  CheckCircle2,
  Timer,
  PenLine,
} from 'lucide-react'
import type { OrdemBacklogEnvaseItem } from '@/app/api/backlog/envase/route'

type FiltroOrdem = 'pendentes' | 'maior_volume' | 'menor_volume' | 'data_proxima'

type Props = {
  ordens: OrdemBacklogEnvaseItem[]
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

function StatusTanqueBadge({ status, nome }: { status: string | null; nome: string | null }) {
  if (!status) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-[#F0F2F5] px-1.5 py-0.5 text-[10px] font-medium text-[#6B7280]">
        Sem tanque vinculado
      </span>
    )
  }

  if (status === 'COMPLETED') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
        <CheckCircle2 size={9} />
        {nome ?? 'Tanque'}: Pronto
      </span>
    )
  }

  if (status === 'IN_PRODUCTION') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
        <Timer size={9} />
        {nome ?? 'Tanque'}: Produzindo
      </span>
    )
  }

  if (status === 'SCHEDULED') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
        <Clock size={9} />
        {nome ?? 'Tanque'}: Agendado
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 rounded-full bg-[#F0F2F5] px-1.5 py-0.5 text-[10px] font-medium text-[#6B7280]">
      {nome ?? 'Tanque'}: Backlog
    </span>
  )
}

function DraggableCard({ ordem }: { ordem: OrdemBacklogEnvaseItem }) {
  const atrasado = isAtrasado(ordem.data_prevista)
  const urgente = isUrgente(ordem.data_prevista)
  const alerta = atrasado || urgente
  const aguardandoTanque = ordem.planning_status === 'WAITING_TANK'
  const parseFalhou = ordem.confianca_embalagem === 'manual'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `backlog:${ordem.id}`,
    data: { type: 'backlog', ordemId: ordem.id },
  })

  const borderColor = atrasado
    ? '#DC2626'
    : urgente
    ? '#D97706'
    : aguardandoTanque
    ? '#7C3AED'
    : '#10B981'

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group relative cursor-grab select-none rounded-[10px] border bg-white transition-all duration-[120ms] active:cursor-grabbing ${
        isDragging ? 'opacity-40 shadow-2xl ring-2 ring-[#10B981]' : 'hover:shadow-md'
      } ${
        atrasado
          ? 'border-red-200 hover:border-red-300'
          : urgente
          ? 'border-amber-200 hover:border-amber-300'
          : aguardandoTanque
          ? 'border-purple-200 hover:border-purple-300'
          : 'border-[#E4E7EC] hover:border-[#CDD2DA]'
      }`}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      {/* Header */}
      <div className="px-3 pt-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold leading-snug text-[#111827]">
              {ordem.produto_base || ordem.produto_descricao}
            </div>
            {ordem.embalagem_label && (
              <div className="mt-0.5 flex items-center gap-1">
                <FlaskConical size={11} className="shrink-0 text-[#10B981]" />
                <span className="text-[12px] font-bold text-[#10B981]">{ordem.embalagem_label}</span>
                {parseFalhou && (
                  <span title="Embalagem identificada manualmente">
                    <PenLine size={10} className="text-amber-500" />
                  </span>
                )}
              </div>
            )}
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
            {aguardandoTanque && (
              <span className="flex items-center gap-1 rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                <Clock size={9} />
                Aguard. Tanque
              </span>
            )}
            {!alerta && !aguardandoTanque && (
              <span className="rounded-full bg-[#F0F2F5] px-2 py-0.5 text-[10px] font-medium uppercase text-[#4B5563]">
                Pendente
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Volume e embalagens */}
      <div className="mt-2 px-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Droplets size={13} className="shrink-0 text-[#10B981]" />
            <span className="text-[13px] font-bold text-[#111827]">
              {ordem.total_litros > 0
                ? `${ordem.total_litros.toLocaleString('pt-BR')} L`
                : `${ordem.quantidade.toLocaleString('pt-BR')} ${ordem.unidade}`}
            </span>
          </div>
          {ordem.total_embalagens > 0 && (
            <span className="text-[11px] text-[#9CA3AF]">
              · {ordem.total_embalagens.toLocaleString('pt-BR')} embal.
            </span>
          )}
        </div>

        {parseFalhou && (
          <div className="mt-1 flex items-center gap-1 rounded-[6px] border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
            <PenLine size={10} />
            Volume/embalagem não identificados — edite manualmente
          </div>
        )}
      </div>

      {/* Status do tanque origem */}
      {(ordem.origin_tank_order_id || ordem.origin_tank_status) && (
        <div className="mt-2 px-3">
          <StatusTanqueBadge status={ordem.origin_tank_status} nome={ordem.origin_tank_nome} />
        </div>
      )}

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
        <div className="rounded-[6px] bg-[#ECFDF5] px-2 py-1 text-center">
          <div className="flex items-center justify-center gap-0.5 text-[10px] font-medium uppercase text-[#10B981]">
            <Clock size={9} />
            Total
          </div>
          <div className="font-mono text-[11px] font-semibold text-[#10B981]">
            {formatarDuracao(ordem.total_duration_minutes)}
          </div>
        </div>
      </div>

      {/* Footer */}
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

      {/* Tooltip pedidos */}
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
                <span className="shrink-0 font-mono text-[#10B981]">
                  {p.total_litros.toLocaleString('pt-BR')}L
                </span>
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

export function BacklogEnvase({ ordens, loading }: Props) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroOrdem>('pendentes')

  const ordensFiltradas = useMemo(() => {
    const termo = normalizarBusca(busca)

    let resultado = ordens.filter((o) => {
      if (!termo) return true
      return [o.produto_base, o.produto_descricao, o.numero_externo, o.embalagem_label,
        ...o.pedidos.map((p) => p.numero_pedido)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo))
    })

    if (filtro === 'maior_volume') {
      resultado = [...resultado].sort((a, b) => b.total_litros - a.total_litros)
    } else if (filtro === 'menor_volume') {
      resultado = [...resultado].sort((a, b) => a.total_litros - b.total_litros)
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

  const aguardandoTanqueCount = useMemo(
    () => ordens.filter((o) => o.planning_status === 'WAITING_TANK').length,
    [ordens]
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#E4E7EC] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical size={16} className="text-[#10B981]" />
            <span className="text-sm font-semibold text-[#111827]">Backlog de Envase</span>
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#10B981] px-1 text-[10px] font-medium text-white">
              {ordens.length}
            </span>
          </div>
          <div className="flex gap-1">
            {atrasadosCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                <AlertTriangle size={10} />
                {atrasadosCount} atrasado{atrasadosCount > 1 ? 's' : ''}
              </span>
            )}
            {aguardandoTanqueCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                <Clock size={10} />
                {aguardandoTanqueCount} ag. tanque
              </span>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[#9CA3AF]">
          <span className="rounded-[4px] bg-[#ECFDF5] px-1.5 py-0.5 font-medium text-[#10B981]">
            Ordem de Produção - Envase
          </span>
          <span>→ aguardando máquina</span>
        </div>

        {/* Busca */}
        <div className="mt-2 flex h-8 items-center gap-2 rounded-[8px] border border-[#E4E7EC] px-2 focus-within:border-[#10B981]">
          <Search size={13} className="shrink-0 text-[#9CA3AF]" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto, embalagem, pedido..."
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
                  ? 'bg-[#10B981] text-white'
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
              <div key={i} className="h-36 animate-pulse rounded-[10px] bg-[#F0F2F5]" />
            ))}
          </div>
        ) : ordensFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#E4E7EC] p-8 text-center">
            <FlaskConical size={20} className="text-[#9CA3AF]" />
            <div className="text-[13px] font-medium text-[#4B5563]">
              {busca ? 'Nenhuma ordem encontrada' : 'Backlog vazio'}
            </div>
            <div className="text-[11px] text-[#9CA3AF]">
              {busca
                ? 'Tente outro termo de busca'
                : 'Crie ordens em Ordem de Produção - Envase para preencher o backlog'}
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
