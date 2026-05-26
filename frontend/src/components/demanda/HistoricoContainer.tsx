'use client'
import { apiUrl } from '@/lib/api'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Search, SlidersHorizontal, Clock, Calendar, Zap,
  CheckCircle2, XCircle, RefreshCw, Filter, ArrowUpDown,
} from 'lucide-react'
import type { AuditLog, OrdemHistorico, PlanningStatus } from '@/types'
import { OrdemHistoricoCard } from './OrdemHistoricoCard'

type Ordenacao = 'recente' | 'antigo' | 'status' | 'nome'

type MetricaStatus = {
  status: PlanningStatus
  label: string
  cor: string
  icone: React.ElementType
}

const METRICAS_CONFIG: MetricaStatus[] = [
  { status: 'BACKLOG',       label: 'Backlog',      cor: 'bg-slate-50  border-slate-200  text-slate-600',  icone: Clock },
  { status: 'SCHEDULED',     label: 'Agendadas',    cor: 'bg-blue-50   border-blue-200   text-blue-700',   icone: Calendar },
  { status: 'IN_PRODUCTION', label: 'Em ProduÃ§Ã£o',  cor: 'bg-amber-50  border-amber-200  text-amber-700',  icone: Zap },
  { status: 'COMPLETED',     label: 'ConcluÃ­das',   cor: 'bg-emerald-50 border-emerald-200 text-emerald-700', icone: CheckCircle2 },
  { status: 'CANCELED',      label: 'Canceladas',   cor: 'bg-red-50    border-red-200    text-red-600',    icone: XCircle },
]

const STATUS_LABELS: Partial<Record<PlanningStatus, string>> = {
  BACKLOG: 'Backlog', WAITING_TANK: 'Ag. Tanque', READY_TO_SCHEDULE: 'Pronto p/ Agendar',
  SCHEDULED: 'Agendadas', IN_PRODUCTION: 'Em ProduÃ§Ã£o',
  COMPLETED: 'ConcluÃ­das', CANCELED: 'Canceladas',
}

STATUS_LABELS.PAUSED = 'Pausadas'

export function HistoricoContainer({ etapa = 'tanque' }: { etapa?: string } = {}) {
  const [ordens, setOrdens] = useState<OrdemHistorico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<PlanningStatus[]>([])
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('recente')
  const [ordemExpandida, setOrdemExpandida] = useState<string | null>(null)
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLog[]>>({})
  const [auditCarregando, setAuditCarregando] = useState<Record<string, boolean>>({})

  const carregarOrdens = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await fetch(apiUrl(`/api/historico/producoes?etapa=${etapa}`))
      if (res.ok) {
        const data = await res.json()
        setOrdens(Array.isArray(data) ? data : [])
      }
    } catch {
      // silencioso
    } finally {
      setCarregando(false)
    }
  }, [etapa])

  useEffect(() => {
    carregarOrdens()
  }, [carregarOrdens])

  const carregarAudit = useCallback(async (ordemId: string) => {
    if (auditLogs[ordemId]) return
    setAuditCarregando((prev) => ({ ...prev, [ordemId]: true }))
    try {
      const res = await fetch(apiUrl(`/api/historico/audit-log?ordem_id=${ordemId}`))
      if (res.ok) {
        const data = await res.json()
        setAuditLogs((prev) => ({ ...prev, [ordemId]: Array.isArray(data) ? data : [] }))
      }
    } catch {
      setAuditLogs((prev) => ({ ...prev, [ordemId]: [] }))
    } finally {
      setAuditCarregando((prev) => ({ ...prev, [ordemId]: false }))
    }
  }, [auditLogs])

  const handleToggle = useCallback((ordemId: string) => {
    setOrdemExpandida((prev) => {
      const novoEstado = prev === ordemId ? null : ordemId
      if (novoEstado) carregarAudit(novoEstado)
      return novoEstado
    })
  }, [carregarAudit])

  const toggleFiltroStatus = (status: PlanningStatus) => {
    setFiltroStatus((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    )
  }

  // Contagem por status
  const contagens = useMemo(() => {
    const map: Record<string, number> = {}
    for (const o of ordens) {
      const s = o.planning_status ?? 'BACKLOG'
      map[s] = (map[s] ?? 0) + 1
    }
    return map
  }, [ordens])

  // Filtro + ordenaÃ§Ã£o
  const ordensFiltradas = useMemo(() => {
    let lista = [...ordens]

    if (filtroStatus.length > 0) {
      lista = lista.filter((o) => filtroStatus.includes((o.planning_status ?? 'BACKLOG') as PlanningStatus))
    }

    if (busca.trim()) {
      const s = busca.toLowerCase()
      lista = lista.filter((o) => {
        const nome = (o.numero_externo ?? '').toLowerCase()
        const cat = (o.tanque ?? '').toLowerCase()
        const pedidos = (o.pedidos_vinculados ?? []).some(
          (p) => (p.numero_pedido ?? '').toLowerCase().includes(s) || (p.produto_descricao ?? '').toLowerCase().includes(s)
        )
        return nome.includes(s) || cat.includes(s) || pedidos
      })
    }

    lista.sort((a, b) => {
      switch (ordenacao) {
        case 'recente': return (b.sincronizado_em ?? '').localeCompare(a.sincronizado_em ?? '')
        case 'antigo':  return (a.sincronizado_em ?? '').localeCompare(b.sincronizado_em ?? '')
        case 'nome':    return (a.numero_externo ?? '').localeCompare(b.numero_externo ?? '')
        case 'status': {
          const ordem: Record<string, number> = { IN_PRODUCTION: 0, SCHEDULED: 1, BACKLOG: 2, COMPLETED: 3, CANCELED: 4 }
          return (ordem[a.planning_status ?? 'BACKLOG'] ?? 5) - (ordem[b.planning_status ?? 'BACKLOG'] ?? 5)
        }
        default: return 0
      }
    })

    return lista
  }, [ordens, filtroStatus, busca, ordenacao])

  return (
    <div className="space-y-5">
      {/* CabeÃ§alho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">HistÃ³rico de ProduÃ§Ãµes</h2>
          <p className="text-sm text-slate-500 mt-0.5">Rastreabilidade e auditoria operacional completa</p>
        </div>
        <button
          onClick={carregarOrdens}
          disabled={carregando}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 bg-white px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Cards de mÃ©tricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {METRICAS_CONFIG.map(({ status, label, cor, icone: Icone }) => {
          const count = contagens[status] ?? 0
          const ativo = filtroStatus.includes(status)
          return (
            <button
              key={status}
              onClick={() => toggleFiltroStatus(status)}
              className={`rounded-xl border p-3 text-left transition-all ${cor} ${
                ativo ? 'ring-2 ring-offset-1 ring-blue-400 shadow-md' : 'hover:shadow-sm'
              }`}
            >
              <Icone size={18} className="mb-1 opacity-70" />
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs font-medium mt-0.5">{label}</div>
            </button>
          )
        })}
      </div>

      {/* Barra de busca e filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Busca */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, categoria ou pedido..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filtro de status (chips) */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-slate-400 shrink-0" />
          {filtroStatus.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {filtroStatus.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleFiltroStatus(s)}
                  className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-blue-700"
                >
                  {STATUS_LABELS[s]}
                  <XCircle size={10} />
                </button>
              ))}
            </div>
          )}
          {filtroStatus.length === 0 && (
            <span className="text-xs text-slate-400">Clique nas mÃ©tricas para filtrar</span>
          )}
        </div>

        {/* OrdenaÃ§Ã£o */}
        <div className="flex items-center gap-1">
          <ArrowUpDown size={14} className="text-slate-400 shrink-0" />
          <select
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="recente">Mais recentes</option>
            <option value="antigo">Mais antigas</option>
            <option value="status">Por status</option>
            <option value="nome">Por nome</option>
          </select>
        </div>
      </div>

      {/* Contagem de resultados */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <SlidersHorizontal size={14} />
        {carregando ? 'Carregando...' : `${ordensFiltradas.length} ordem${ordensFiltradas.length !== 1 ? 's' : ''} encontrada${ordensFiltradas.length !== 1 ? 's' : ''}`}
        {(busca || filtroStatus.length > 0) && (
          <button
            onClick={() => { setBusca(''); setFiltroStatus([]) }}
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Lista de cards */}
      {carregando ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-200 mt-1" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : ordensFiltradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <CheckCircle2 size={40} className="mx-auto text-slate-200 mb-3" />
          <p className="font-semibold text-slate-500">Nenhuma produÃ§Ã£o encontrada</p>
          <p className="text-sm text-slate-400 mt-1">
            {busca || filtroStatus.length > 0 ? 'Tente ajustar os filtros' : 'Crie uma demanda para comeÃ§ar'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordensFiltradas.map((ordem) => (
            <OrdemHistoricoCard
              key={ordem.id}
              ordem={ordem}
              auditLogs={auditLogs[ordem.id] ?? []}
              expandido={ordemExpandida === ordem.id}
              carregandoAudit={auditCarregando[ordem.id] ?? false}
              onToggle={() => handleToggle(ordem.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
