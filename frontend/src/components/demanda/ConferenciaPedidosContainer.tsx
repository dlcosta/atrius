'use client'
import { apiUrl } from '@/lib/api'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Search, Package, Clock, Calendar, Zap, CheckCircle2,
  XCircle, RefreshCw, ChevronDown, ChevronRight, Layers,
  CalendarDays, AlertTriangle, SlidersHorizontal, Filter,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ItemConferencia } from '@/types'

// ─── Status ──────────────────────────────────────────────────────────────────

type StatusConferencia = 'PENDENTE' | 'AGENDADO' | 'PRODUZINDO' | 'CONCLUIDO' | 'CANCELADO'
type FiltroStatus = 'TODOS' | StatusConferencia

function calcularStatus(item: ItemConferencia): StatusConferencia {
  if (!item.alocado || !item.ordem_id) return 'PENDENTE'
  switch (item.ordem_status) {
    case 'BACKLOG':
    case 'SCHEDULED':    return 'AGENDADO'
    case 'IN_PRODUCTION': return 'PRODUZINDO'
    case 'COMPLETED':    return 'CONCLUIDO'
    case 'CANCELED':     return 'CANCELADO'
    default:             return 'PENDENTE'
  }
}

type StatusCfg = {
  label: string
  badge: string
  dot: string
  icone: React.ElementType
}

const STATUS_CFG: Record<StatusConferencia, StatusCfg> = {
  PENDENTE:  { label: 'Pendente',   badge: 'bg-orange-100 text-orange-700 border border-orange-200', dot: 'bg-orange-400',  icone: Clock },
  AGENDADO:  { label: 'Agendado',   badge: 'bg-blue-100 text-blue-700 border border-blue-200',       dot: 'bg-blue-500',    icone: Calendar },
  PRODUZINDO:{ label: 'Produzindo', badge: 'bg-purple-100 text-purple-700 border border-purple-200', dot: 'bg-purple-500',  icone: Zap },
  CONCLUIDO: { label: 'Concluído',  badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500', icone: CheckCircle2 },
  CANCELADO: { label: 'Cancelado',  badge: 'bg-red-100 text-red-600 border border-red-200',          dot: 'bg-red-400',     icone: XCircle },
}

const FILTROS: { valor: FiltroStatus; label: string; cor: string }[] = [
  { valor: 'TODOS',     label: 'Todos',      cor: 'bg-slate-100 text-slate-700 hover:bg-slate-200 data-[active=true]:bg-slate-700 data-[active=true]:text-white' },
  { valor: 'PENDENTE',  label: 'Pendentes',  cor: 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 data-[active=true]:bg-orange-500 data-[active=true]:text-white data-[active=true]:border-orange-500' },
  { valor: 'AGENDADO',  label: 'Agendados',  cor: 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 data-[active=true]:bg-blue-600 data-[active=true]:text-white data-[active=true]:border-blue-600' },
  { valor: 'PRODUZINDO',label: 'Produzindo', cor: 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 data-[active=true]:bg-purple-600 data-[active=true]:text-white data-[active=true]:border-purple-600' },
  { valor: 'CONCLUIDO', label: 'Concluídos', cor: 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:border-emerald-600' },
]

// ─── Aggregation ─────────────────────────────────────────────────────────────

type ItemComStatus = ItemConferencia & { status: StatusConferencia }

type PedidoConferencia = {
  numero_pedido: string
  cliente_nome: string
  dataPedido: string | null
  dataPrevista: string | null
  itens: ItemComStatus[]
  totalLitros: number
  litrosPorStatus: Record<StatusConferencia, number>
  countPorStatus: Record<StatusConferencia, number>
  percentualConcluido: number
  percentualProduzindo: number
  percentualAgendado: number
}

function agruparPorPedido(itens: ItemConferencia[]): PedidoConferencia[] {
  const mapa = new Map<string, ItemConferencia[]>()
  for (const item of itens) {
    if (!mapa.has(item.numero_pedido)) mapa.set(item.numero_pedido, [])
    mapa.get(item.numero_pedido)!.push(item)
  }

  return Array.from(mapa.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([numero_pedido, itensPedido]) => {
      const itensComStatus: ItemComStatus[] = itensPedido.map((i) => ({
        ...i,
        status: calcularStatus(i),
      }))

      const totalLitros = itensComStatus.reduce((acc, i) => acc + i.total_litros, 0)
      const litrosPorStatus = { PENDENTE: 0, AGENDADO: 0, PRODUZINDO: 0, CONCLUIDO: 0, CANCELADO: 0 } as Record<StatusConferencia, number>
      const countPorStatus = { PENDENTE: 0, AGENDADO: 0, PRODUZINDO: 0, CONCLUIDO: 0, CANCELADO: 0 } as Record<StatusConferencia, number>

      for (const item of itensComStatus) {
        litrosPorStatus[item.status] += item.total_litros
        countPorStatus[item.status] += 1
      }

      return {
        numero_pedido,
        cliente_nome: itensPedido[0]?.cliente_nome ?? 'Desconhecido',
        dataPedido: itensPedido.find((i) => i.data_pedido)?.data_pedido ?? null,
        dataPrevista: itensPedido.find((i) => i.data_prevista)?.data_prevista ?? null,
        itens: itensComStatus.sort((a, b) =>
          (a.data_prevista ?? '').localeCompare(b.data_prevista ?? '')
        ),
        totalLitros,
        litrosPorStatus,
        countPorStatus,
        percentualConcluido: totalLitros > 0 ? (litrosPorStatus.CONCLUIDO / totalLitros) * 100 : 0,
        percentualProduzindo: totalLitros > 0 ? (litrosPorStatus.PRODUZINDO / totalLitros) * 100 : 0,
        percentualAgendado:   totalLitros > 0 ? (litrosPorStatus.AGENDADO / totalLitros) * 100 : 0,
      }
    })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtData(value?: string | null): string {
  if (!value) return 'Sem data'
  try { return format(parseISO(value.slice(0, 10)), 'dd/MM/yyyy', { locale: ptBR }) }
  catch { return value.slice(0, 10) }
}

function fmtLitros(n: number): string {
  return n.toLocaleString('pt-BR') + 'L'
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function BarraProgresso({ pedido }: { pedido: PedidoConferencia }) {
  const { percentualConcluido, percentualProduzindo, percentualAgendado } = pedido
  const pendentePct = Math.max(0, 100 - percentualConcluido - percentualProduzindo - percentualAgendado)

  return (
    <div className="w-full">
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
        {percentualConcluido > 0 && (
          <div className="bg-emerald-500 transition-all" style={{ width: `${percentualConcluido}%` }} title={`Concluído: ${percentualConcluido.toFixed(0)}%`} />
        )}
        {percentualProduzindo > 0 && (
          <div className="bg-purple-500 transition-all" style={{ width: `${percentualProduzindo}%` }} title={`Produzindo: ${percentualProduzindo.toFixed(0)}%`} />
        )}
        {percentualAgendado > 0 && (
          <div className="bg-blue-400 transition-all" style={{ width: `${percentualAgendado}%` }} title={`Agendado: ${percentualAgendado.toFixed(0)}%`} />
        )}
        {pendentePct > 0 && (
          <div className="bg-orange-200 flex-1" title={`Pendente: ${pendentePct.toFixed(0)}%`} />
        )}
      </div>
    </div>
  )
}

function BadgeStatus({ status }: { status: StatusConferencia }) {
  const cfg = STATUS_CFG[status]
  const Icone = cfg.icone
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
      <Icone size={10} />
      {cfg.label}
    </span>
  )
}

function ItemRow({ item }: { item: ItemComStatus }) {
  const cfg = STATUS_CFG[item.status]
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs">
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 leading-snug">{item.produto_descricao}</span>
            <BadgeStatus status={item.status} />
          </div>

          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
            <span className="flex items-center gap-1">
              <CalendarDays size={11} />
              Previsão: <span className="font-medium text-slate-700">{fmtData(item.data_prevista)}</span>
            </span>
            <span>
              Qtd: <span className="font-medium text-slate-700">{item.quantidade}</span>
            </span>
            <span>
              Volume: <span className="font-medium text-slate-700">{fmtLitros(item.total_litros)}</span>
            </span>
          </div>

          {/* Detalhes da ordem vinculada */}
          {item.alocado && item.ordem_id && (
            <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
              {item.nome_ordem && (
                <span className="flex items-center gap-1">
                  <Package size={11} />
                  Ordem: <span className="font-medium text-slate-700">{item.nome_ordem}</span>
                </span>
              )}
              {item.tank_nome && (
                <span className="flex items-center gap-1">
                  <Layers size={11} />
                  Tanque: <span className="font-medium text-slate-700">{item.tank_nome}</span>
                </span>
              )}
              {item.turno_nome && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  Turno: <span className="font-medium text-slate-700">{item.turno_nome}</span>
                </span>
              )}
              {item.data_agendamento && (
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  Agendado: <span className="font-medium text-slate-700">{fmtData(item.data_agendamento)}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PedidoCard({
  pedido,
  filtroAtivo,
}: {
  pedido: PedidoConferencia
  filtroAtivo: FiltroStatus
}) {
  const [expandido, setExpandido] = useState(false)

  const itensMostrados = useMemo(() => {
    if (filtroAtivo === 'TODOS') return pedido.itens
    return pedido.itens.filter((i) => i.status === filtroAtivo)
  }, [pedido.itens, filtroAtivo])

  const { countPorStatus } = pedido
  const temAlerta = countPorStatus.PENDENTE > 0 && (countPorStatus.AGENDADO + countPorStatus.PRODUZINDO + countPorStatus.CONCLUIDO) > 0

  const totalPct = pedido.percentualConcluido + pedido.percentualProduzindo + pedido.percentualAgendado

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
      expandido ? 'border-slate-300 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow'
    }`}>
      {/* Header */}
      <button
        onClick={() => setExpandido((p) => !p)}
        className="w-full flex items-start gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="mt-1 shrink-0">
          {expandido ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Linha 1: número + cliente + alerta */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900">Pedido {pedido.numero_pedido}</span>
            {temAlerta && (
              <span className="flex items-center gap-0.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                <AlertTriangle size={10} />
                Parcial
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">{pedido.cliente_nome}</div>

          {/* Datas */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1.5 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <CalendarDays size={11} />
              Pedido: <span className="font-medium text-slate-700">{fmtData(pedido.dataPedido)}</span>
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays size={11} />
              Prevista: <span className="font-medium text-slate-700">{fmtData(pedido.dataPrevista)}</span>
            </span>
          </div>

          {/* Barra de progresso */}
          <div className="mt-2.5">
            <BarraProgresso pedido={pedido} />
          </div>

          {/* Resumo por status (chips) */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(Object.entries(countPorStatus) as [StatusConferencia, number][])
              .filter(([, count]) => count > 0)
              .map(([status, count]) => {
                const cfg = STATUS_CFG[status]
                const Icone = cfg.icone
                return (
                  <span key={status} className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                    <Icone size={10} />
                    {count} {cfg.label.toLowerCase()}
                  </span>
                )
              })}
          </div>
        </div>

        {/* Métricas direita */}
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold text-slate-900">{fmtLitros(pedido.totalLitros)}</div>
          <div className="text-xs text-slate-500 mt-0.5">{pedido.itens.length} iten{pedido.itens.length !== 1 ? 's' : ''}</div>
          <div className={`text-xs font-semibold mt-1 ${
            totalPct >= 100 ? 'text-emerald-600' : totalPct > 0 ? 'text-blue-600' : 'text-orange-500'
          }`}>
            {totalPct.toFixed(0)}%
          </div>
        </div>
      </button>

      {/* Conteúdo expandido */}
      {expandido && (
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          {/* Resumo volumes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {(Object.entries(pedido.litrosPorStatus) as [StatusConferencia, number][])
              .filter(([, litros]) => litros > 0)
              .map(([status, litros]) => {
                const cfg = STATUS_CFG[status]
                return (
                  <div key={status} className={`rounded-lg p-2.5 border text-xs ${cfg.badge}`}>
                    <div className="font-bold text-base">{fmtLitros(litros)}</div>
                    <div className="font-medium mt-0.5">{cfg.label}</div>
                  </div>
                )
              })}
          </div>

          {/* Itens */}
          <div className="space-y-2">
            {itensMostrados.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-3">
                Nenhum item com status "{STATUS_CFG[filtroAtivo as StatusConferencia]?.label}"
              </p>
            ) : (
              itensMostrados.map((item) => (
                <ItemRow
                  key={`${item.numero_pedido}::${item.produto_descricao}::${item.data_prevista ?? ''}`}
                  item={item}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Container principal ──────────────────────────────────────────────────────

export function ConferenciaPedidosContainer() {
  const [itens, setItens] = useState<ItemConferencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('TODOS')

  const carregarItens = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await fetch(apiUrl('/api/conferencia/pedidos'))
      if (res.ok) {
        const data = await res.json()
        setItens(Array.isArray(data) ? data : [])
      }
    } catch {
      // silencioso
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregarItens()
  }, [carregarItens])

  const pedidos = useMemo(() => agruparPorPedido(itens), [itens])

  // Contagem global por status
  const contagemGlobal = useMemo(() => {
    const counts = { PENDENTE: 0, AGENDADO: 0, PRODUZINDO: 0, CONCLUIDO: 0, CANCELADO: 0 } as Record<StatusConferencia, number>
    for (const p of pedidos) {
      for (const [status, count] of Object.entries(p.countPorStatus) as [StatusConferencia, number][]) {
        counts[status] += count
      }
    }
    return counts
  }, [pedidos])

  const pedidosFiltrados = useMemo(() => {
    let lista = [...pedidos]

    // Filtro por status (mostra pedidos com ao menos 1 item no status)
    if (filtroStatus !== 'TODOS') {
      lista = lista.filter((p) => (p.countPorStatus[filtroStatus] ?? 0) > 0)
    }

    // Filtro por busca
    if (busca.trim()) {
      const s = busca.toLowerCase()
      lista = lista.filter((p) => {
        if (p.numero_pedido.toLowerCase().includes(s)) return true
        if (p.cliente_nome.toLowerCase().includes(s)) return true
        return p.itens.some((i) => i.produto_descricao.toLowerCase().includes(s))
      })
    }

    return lista
  }, [pedidos, filtroStatus, busca])

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Conferência de Pedidos</h2>
          <p className="text-sm text-slate-500 mt-0.5">Rastreie cada item desde o pedido até a conclusão da produção</p>
        </div>
        <button
          onClick={carregarItens}
          disabled={carregando}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 bg-white px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por número do pedido, cliente ou produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
      </div>

      {/* Filtros de status */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-slate-400 shrink-0" />
        {FILTROS.map(({ valor, label, cor }) => {
          const count = valor === 'TODOS'
            ? pedidos.length
            : pedidos.filter((p) => (p.countPorStatus[valor as StatusConferencia] ?? 0) > 0).length
          const ativo = filtroStatus === valor
          return (
            <button
              key={valor}
              data-active={ativo}
              onClick={() => setFiltroStatus(valor)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${cor}`}
            >
              {label}
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                ativo ? 'bg-white/20' : 'bg-slate-200 text-slate-600'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Contagem global de itens por status */}
      {!carregando && itens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([ 'PENDENTE', 'AGENDADO', 'PRODUZINDO', 'CONCLUIDO'] as StatusConferencia[]).map((status) => {
            const cfg = STATUS_CFG[status]
            const Icone = cfg.icone
            const count = contagemGlobal[status]
            return (
              <div key={status} className={`rounded-xl border p-3 ${cfg.badge}`}>
                <Icone size={16} className="mb-1 opacity-70" />
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs font-medium mt-0.5">{count === 1 ? 'item' : 'itens'} {cfg.label.toLowerCase()}{count !== 1 && status !== 'CONCLUIDO' ? 's' : ''}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Resultado */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <SlidersHorizontal size={14} />
        {carregando
          ? 'Carregando...'
          : `${pedidosFiltrados.length} pedido${pedidosFiltrados.length !== 1 ? 's' : ''}`}
        {(busca || filtroStatus !== 'TODOS') && (
          <button
            onClick={() => { setBusca(''); setFiltroStatus('TODOS') }}
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Lista de pedidos */}
      {carregando ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-4 h-4 rounded bg-slate-200 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                  <div className="h-2 bg-slate-100 rounded w-full mt-3" />
                  <div className="flex gap-2">
                    <div className="h-5 bg-slate-100 rounded-full w-16" />
                    <div className="h-5 bg-slate-100 rounded-full w-16" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Package size={40} className="mx-auto text-slate-200 mb-3" />
          <p className="font-semibold text-slate-500">Nenhum pedido encontrado</p>
          <p className="text-sm text-slate-400 mt-1">
            {busca || filtroStatus !== 'TODOS' ? 'Tente ajustar a busca ou os filtros' : 'Nenhum pedido disponível'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidosFiltrados.map((pedido) => (
            <PedidoCard
              key={pedido.numero_pedido}
              pedido={pedido}
              filtroAtivo={filtroStatus}
            />
          ))}
        </div>
      )}

      {/* Legenda da barra de progresso */}
      {!carregando && pedidosFiltrados.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1 border-t border-slate-100">
          <span className="font-medium">Barra de progresso:</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-500 inline-block" />Concluído</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-purple-500 inline-block" />Produzindo</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-blue-400 inline-block" />Agendado</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-orange-200 inline-block" />Pendente</span>
        </div>
      )}
    </div>
  )
}
