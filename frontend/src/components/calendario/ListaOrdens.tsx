'use client'
import { apiUrl } from '@/lib/api'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { RefreshCw, Search, CalendarDays, Droplets, FlaskConical, Box } from 'lucide-react'
import type { EtapaOrdem, Ordem, PlanningStatus } from '@/types'

type Props = {
  etapa: EtapaOrdem
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; dot: string }
> = {
  BACKLOG: {
    label: 'Para agendar',
    bg: 'bg-[#F0F2F5]',
    text: 'text-[#4B5563]',
    dot: 'bg-[#9CA3AF]',
  },
  WAITING_TANK: {
    label: 'Aguardando tanque',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  READY_TO_SCHEDULE: {
    label: 'Para agendar',
    bg: 'bg-sky-100',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  SCHEDULED: {
    label: 'Agendado',
    bg: 'bg-[#EFF6FF]',
    text: 'text-[#2563EB]',
    dot: 'bg-[#2563EB]',
  },
  IN_PRODUCTION: {
    label: 'Em produção',
    bg: 'bg-green-100',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
  PAUSED: {
    label: 'Pausado',
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
  },
  COMPLETED: {
    label: 'Concluído',
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  CANCELED: {
    label: 'Cancelado',
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
}

function resolverStatus(ordem: Ordem): string {
  if (ordem.planning_status) return ordem.planning_status
  if (ordem.status === 'cancelada') return 'CANCELED'
  if (ordem.status === 'concluida') return 'COMPLETED'
  if (ordem.status === 'pausada') return 'PAUSED'
  if (ordem.status === 'produzindo' || ordem.status === 'limpeza') return 'IN_PRODUCTION'
  if (ordem.inicio_agendado) return 'SCHEDULED'
  return 'BACKLOG'
}

function formatarData(ordem: Ordem): string {
  const ref = ordem.inicio_agendado ?? ordem.data_prevista
  if (!ref) return 'Sem data'
  try {
    const d = new Date(ref)
    if (ordem.inicio_agendado) {
      return format(d, "dd 'de' MMM yyyy', às' HH:mm", { locale: ptBR })
    }
    return format(d, "dd 'de' MMM yyyy", { locale: ptBR })
  } catch {
    return ref
  }
}

function ordenarOrdens(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    // Ordens em produção ou agendadas primeiro
    const prioridadeA = resolverStatus(a) === 'IN_PRODUCTION' || resolverStatus(a) === 'SCHEDULED' ? 0 : 1
    const prioridadeB = resolverStatus(b) === 'IN_PRODUCTION' || resolverStatus(b) === 'SCHEDULED' ? 0 : 1
    if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB

    const refA = a.inicio_agendado ?? a.data_prevista
    const refB = b.inicio_agendado ?? b.data_prevista
    if (!refA && !refB) return 0
    if (!refA) return 1
    if (!refB) return -1
    return new Date(refB).getTime() - new Date(refA).getTime()
  })
}

export function ListaOrdens({ etapa }: Props) {
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const data = await fetch(apiUrl('/api/ordens')).then((r) => r.json())
      const lista: Ordem[] = Array.isArray(data) ? data : []
      setOrdens(lista.filter((o) => o.etapa === etapa))
    } catch {
      setErro('Erro ao carregar ordens. Tente recarregar.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [etapa]) // eslint-disable-line react-hooks/exhaustive-deps

  const buscaNorm = busca.trim().toLowerCase()
  const ordensFiltradas = ordenarOrdens(
    ordens.filter((o) => {
      if (!buscaNorm) return true
      const nomeProduto = (o.produto?.nome ?? o.produto_sku ?? '').toLowerCase()
      const lote = (o.lote ?? '').toLowerCase()
      const numero = (o.numero_externo ?? '').toLowerCase()
      const tanqueNome = (o.tanque ?? o.tanque_ref?.nome ?? '').toLowerCase()
      const maquinaNome = (o.maquina?.nome ?? '').toLowerCase()
      return (
        nomeProduto.includes(buscaNorm) ||
        lote.includes(buscaNorm) ||
        numero.includes(buscaNorm) ||
        tanqueNome.includes(buscaNorm) ||
        maquinaNome.includes(buscaNorm)
      )
    }),
  )

  const recursoLabel = etapa === 'tanque' ? 'tanque' : 'máquina'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        {/* Cabeçalho da lista */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] text-[#6B7280]">
              {ordens.length === 0
                ? 'Nenhuma ordem cadastrada ainda.'
                : `${ordens.length} ordem${ordens.length !== 1 ? 's' : ''} cadastrada${ordens.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={carregar}
            className="flex items-center gap-2 rounded-xl border-2 border-[#E4E7EC] bg-white px-4 py-2 text-[14px] font-medium text-[#4B5563] transition-colors hover:bg-[#F0F2F5]"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {/* Busca */}
        <div className="relative mb-5">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
          />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar por produto, lote, número ou ${recursoLabel}...`}
            className="w-full rounded-xl border-2 border-[#E4E7EC] bg-white py-3 pl-11 pr-4 text-[15px] text-[#111827] focus:border-[#2563EB] focus:outline-none"
          />
        </div>

        {/* Estados de carga / erro / vazio */}
        {loading && (
          <div className="py-14 text-center text-[15px] text-[#9CA3AF]">Carregando ordens...</div>
        )}
        {!loading && erro && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-[15px] text-red-700">
            {erro}
          </div>
        )}
        {!loading && !erro && ordensFiltradas.length === 0 && (
          <div className="py-14 text-center text-[15px] text-[#9CA3AF]">
            {buscaNorm ? 'Nenhum resultado para esta busca.' : 'Nenhuma ordem cadastrada ainda.'}
          </div>
        )}

        {/* Lista de ordens */}
        {!loading && !erro && ordensFiltradas.length > 0 && (
          <div className="space-y-3">
            {ordensFiltradas.map((ordem) => {
              const statusKey = resolverStatus(ordem)
              const cfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.BACKLOG
              const nomeProduto = ordem.produto?.nome ?? ordem.produto_sku ?? '—'
              const recurso =
                etapa === 'tanque'
                  ? (ordem.tanque ?? ordem.tanque_ref?.nome ?? '—')
                  : (ordem.maquina?.nome ?? '—')
              const litros = Number(
                ordem.quantidade_referencia_litros ?? ordem.quantidade ?? 0,
              )

              return (
                <div
                  key={ordem.id}
                  className="flex items-start gap-4 rounded-xl border border-[#E4E7EC] bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                  style={
                    ordem.color ?? ordem.produto?.cor
                      ? { borderLeft: `4px solid ${ordem.color ?? ordem.produto?.cor}` }
                      : undefined
                  }
                >
                  {/* Info principal */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-bold text-[#111827]">{nomeProduto}</span>
                      {ordem.lote && (
                        <span className="rounded-full bg-[#F0F2F5] px-2 py-0.5 text-[12px] text-[#6B7280]">
                          Lote {ordem.lote}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-[#6B7280]">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays size={14} />
                        {formatarData(ordem)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {etapa === 'tanque' ? <Droplets size={14} /> : <FlaskConical size={14} />}
                        {recurso}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Box size={14} />
                        {litros > 0 ? `${litros.toLocaleString('pt-BR')} L` : '—'}
                      </span>
                      {etapa === 'envase' && ordem.estimated_boxes ? (
                        <span className="text-[#16A34A]">
                          {ordem.estimated_boxes} caixas
                        </span>
                      ) : null}
                    </div>

                    {ordem.numero_externo && (
                      <div className="mt-1.5 font-mono text-[12px] text-[#9CA3AF]">
                        #{ordem.numero_externo}
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="shrink-0">
                    <span
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${cfg.bg} ${cfg.text}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    {ordem.total_duration_minutes ? (
                      <p className="mt-1.5 text-right text-[12px] text-[#9CA3AF]">
                        {ordem.total_duration_minutes} min
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
