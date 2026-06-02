'use client'
import { apiUrl } from '@/lib/api'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Clock, Calendar, Zap, CheckCircle2, XCircle,
  ChevronUp, Edit3, Package, Layers,
  AlertTriangle, Save, X, Trash2, RotateCcw,
} from 'lucide-react'
import type { AgendamentoProducaoDetalhado, OrdemHistorico, PlanningStatus } from '@/types'

type Props = {
  ordem: OrdemHistorico
  onAtualizado: (ordemAtualizada: Partial<OrdemHistorico> & { id: string }) => void
  onCancelado: (id: string) => void
}

type StatusConfig = {
  label: string
  badge: string
  icone: React.ElementType
  dot: string
}

type AgendamentoDetalhado = AgendamentoProducaoDetalhado & {
  observacao_pausa?: string | null
}

const FALLBACK_STATUS_CONFIG: StatusConfig = {
  label: 'Backlog',
  badge: 'bg-slate-100 text-slate-600 border border-slate-200',
  icone: Clock,
  dot: 'bg-slate-400',
}

const STATUS_CONFIG: Partial<Record<PlanningStatus, StatusConfig>> = {
  BACKLOG:            { label: 'Backlog',           badge: 'bg-slate-100 text-slate-600 border border-slate-200',       icone: Clock,        dot: 'bg-slate-400' },
  WAITING_TANK:       { label: 'Ag. Tanque',        badge: 'bg-purple-100 text-purple-700 border border-purple-200',    icone: Clock,        dot: 'bg-purple-500' },
  READY_TO_SCHEDULE:  { label: 'Pronto p/ Agendar', badge: 'bg-teal-100 text-teal-700 border border-teal-200',          icone: Calendar,     dot: 'bg-teal-500' },
  SCHEDULED:          { label: 'Agendada',          badge: 'bg-blue-100 text-blue-700 border border-blue-200',          icone: Calendar,     dot: 'bg-blue-500' },
  IN_PRODUCTION:      { label: 'Em Produção',       badge: 'bg-amber-100 text-amber-700 border border-amber-200',       icone: Zap,          dot: 'bg-amber-500' },
  COMPLETED:          { label: 'Concluída',         badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200', icone: CheckCircle2, dot: 'bg-emerald-500' },
  CANCELED:           { label: 'Cancelada',         badge: 'bg-red-100 text-red-600 border border-red-200',             icone: XCircle,      dot: 'bg-red-500' },
}

STATUS_CONFIG.PAUSED = {
  label: 'Pausada',
  badge: 'bg-orange-100 text-orange-700 border border-orange-200',
  icone: AlertTriangle,
  dot: 'bg-orange-500',
}

function fmtMin(m: number | null | undefined): string {
  if (!m) return '--'
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h${min > 0 ? String(min).padStart(2, '0') : ''}` : `${min}min`
}

function fmtData(iso: string | null | undefined): string {
  if (!iso) return '--'
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }) } catch { return iso }
}

export function OrdemListaCard({ ordem, onAtualizado, onCancelado }: Props) {
  const statusKey = (ordem.planning_status ?? 'BACKLOG') as PlanningStatus
  const cfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.BACKLOG ?? FALLBACK_STATUS_CONFIG
  const StatusIcone = cfg.icone

  const [expandido, setExpandido] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [motivoCancel, setMotivoCancel] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [revertendo, setRevertendo] = useState(false)

  // Edit state
  const [nomeOrdem, setNomeOrdem] = useState(ordem.numero_externo ?? '')
  const [dataPrevista, setDataPrevista] = useState(ordem.data_prevista ?? '')
  const [producaoMin, setProducaoMin] = useState<number | ''>(ordem.production_time_minutes ?? '')
  const [limpezaMin, setLimpezaMin] = useState<number | ''>(ordem.cleaning_time_minutes ?? '')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const isCancelada = statusKey === 'CANCELED'
  const isConcluida = statusKey === 'COMPLETED'
  const podeEditar = !isCancelada && !isConcluida
  const podeCancelar = !isCancelada && !isConcluida

  const agendamentoPrincipal = ordem.agendamentos?.[0] as AgendamentoDetalhado | undefined
  const tankNome = agendamentoPrincipal?.tank_nome
  const turnoNome = agendamentoPrincipal?.turno_nome
  const dataAgendamento = agendamentoPrincipal?.data_agendamento

  async function salvar() {
    setSalvando(true)
    setErro(null)
    try {
      const body: Record<string, unknown> = {}
      if (nomeOrdem.trim() !== (ordem.numero_externo ?? '')) body.numero_externo = nomeOrdem.trim()
      if (dataPrevista !== (ordem.data_prevista ?? '')) body.data_prevista = dataPrevista || null
      if (producaoMin !== (ordem.production_time_minutes ?? '')) body.production_time_minutes = producaoMin === '' ? null : Number(producaoMin)
      if (limpezaMin !== (ordem.cleaning_time_minutes ?? '')) body.cleaning_time_minutes = limpezaMin === '' ? null : Number(limpezaMin)
      if (motivo.trim()) body.motivo = motivo.trim()

      if (Object.keys(body).length === 0) {
        setExpandido(false)
        return
      }

      const res = await fetch(apiUrl(`/api/producao/ordens/${ordem.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Erro ao salvar'); return }
      onAtualizado({ id: ordem.id, ...data })
      setExpandido(false)
      setMotivo('')
    } catch {
      setErro('Erro de rede')
    } finally {
      setSalvando(false)
    }
  }

  async function cancelar() {
    setCancelando(true)
    try {
      const res = await fetch(apiUrl(`/api/producao/ordens/${ordem.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planning_status: 'CANCELED', motivo: motivoCancel || undefined }),
      })
      if (res.ok) {
        onCancelado(ordem.id)
      }
    } finally {
      setCancelando(false)
      setConfirmCancel(false)
    }
  }

  async function reverter() {
    setRevertendo(true)
    try {
      const res = await fetch(apiUrl(`/api/producao/ordens/${ordem.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planning_status: 'BACKLOG' }),
      })
      const data = await res.json()
      if (res.ok) {
        onAtualizado({ id: ordem.id, ...data })
      }
    } finally {
      setRevertendo(false)
    }
  }

  function resetarEdicao() {
    setNomeOrdem(ordem.numero_externo ?? '')
    setDataPrevista(ordem.data_prevista ?? '')
    setProducaoMin(ordem.production_time_minutes ?? '')
    setLimpezaMin(ordem.cleaning_time_minutes ?? '')
    setMotivo('')
    setErro(null)
    setExpandido(false)
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
      expandido ? 'border-blue-300 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow'
    } ${isCancelada ? 'opacity-60' : ''}`}>

      {/* Cabeçalho */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
          <div className="flex-1 min-w-0">

            {/* Linha 1: nome + status */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 text-sm truncate">
                {ordem.numero_externo || `Ordem ${ordem.id.slice(0, 8)}`}
              </h3>
              <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                <StatusIcone size={11} />
                {cfg.label}
              </span>
            </div>

            {/* Linha 2: categoria + tanque + turno + data */}
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
              {ordem.tanque && (
                <span className="flex items-center gap-1">
                  <Layers size={11} />
                  {ordem.tanque}
                </span>
              )}
              {tankNome && (
                <><span className="text-slate-300">⬢</span><span>{tankNome}</span></>
              )}
              {turnoNome && (
                <><span className="text-slate-300">⬢</span><span>{turnoNome}</span></>
              )}
              {dataAgendamento && (
                <><span className="text-slate-300">⬢</span><span>{fmtData(dataAgendamento)}</span></>
              )}
              {!dataAgendamento && ordem.data_prevista && (
                <><span className="text-slate-300">⬢</span><span className="text-slate-400">{fmtData(ordem.data_prevista)}</span></>
              )}
            </div>

            {/* Linha 3: métricas + ações */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Package size={11} />
                  {ordem.pedidos_vinculados?.length ?? 0} pedido{(ordem.pedidos_vinculados?.length ?? 0) !== 1 ? 's' : ''}
                </span>
                <span className="font-semibold text-slate-700">
                  {(ordem.quantidade ?? 0).toLocaleString('pt-BR')}L
                </span>
                {ordem.total_duration_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {fmtMin(ordem.total_duration_minutes)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isCancelada && (
                  <button
                    onClick={reverter}
                    disabled={revertendo}
                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-semibold transition-colors disabled:opacity-50"
                    title="Reverter para Backlog"
                  >
                    <RotateCcw size={13} />
                    {revertendo ? 'Revertendo...' : 'Reverter'}
                  </button>
                )}
                {podeCancelar && !expandido && (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                    title="Cancelar ordem"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                {podeEditar && (
                  <button
                    onClick={() => { setExpandido(!expandido); setConfirmCancel(false) }}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                  >
                    {expandido
                      ? <><ChevronUp size={14} />Fechar</>
                      : <><Edit3 size={13} />Editar</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmação de cancelamento (inline) */}
      {confirmCancel && (
        <div className="border-t border-red-100 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Cancelar esta ordem?</p>
              <p className="text-xs text-red-500 mt-0.5">Esta ação pode ser registrada no histórico de auditoria.</p>
              <input
                type="text"
                placeholder="Motivo (opcional)"
                value={motivoCancel}
                onChange={(e) => setMotivoCancel(e.target.value)}
                className="mt-2 w-full text-xs border border-red-200 rounded px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={cancelar}
                  disabled={cancelando}
                  className="flex items-center gap-1 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelando ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
                <button
                  onClick={() => { setConfirmCancel(false); setMotivoCancel('') }}
                  className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Painel de edição */}
      {expandido && podeEditar && (
        <div className="border-t border-slate-100 bg-slate-50 p-5">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <Edit3 size={12} />
            Editar ordem
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nome */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nome da ordem</label>
              <input
                type="text"
                value={nomeOrdem}
                onChange={(e) => setNomeOrdem(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Data prevista */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Data prevista</label>
              <input
                type="date"
                value={dataPrevista}
                onChange={(e) => setDataPrevista(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Tempo de produção */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Tempo de produção (min)
              </label>
              <input
                type="number"
                min={1}
                value={producaoMin}
                onChange={(e) => setProducaoMin(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="ex: 120"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {producaoMin !== '' && <p className="text-xs text-slate-400 mt-0.5">{fmtMin(Number(producaoMin))}</p>}
            </div>

            {/* Tempo de limpeza */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Tempo de limpeza (min)
              </label>
              <input
                type="number"
                min={0}
                value={limpezaMin}
                onChange={(e) => setLimpezaMin(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="ex: 30"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {limpezaMin !== '' && <p className="text-xs text-slate-400 mt-0.5">{fmtMin(Number(limpezaMin))}</p>}
            </div>

            {/* Total calculado */}
            {(producaoMin !== '' || limpezaMin !== '') && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <Clock size={13} className="text-blue-500" />
                Total: <span className="font-bold text-blue-700">
                  {fmtMin((Number(producaoMin) || 0) + (Number(limpezaMin) || 0))}
                </span>
              </div>
            )}

            {/* Motivo */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Motivo da edição <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Registrado no histórico de auditoria"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {erro && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {salvando ? 'Salvando...' : 'Salvar alterações'}
            </button>
            <button
              onClick={resetarEdicao}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X size={14} />
              Cancelar
            </button>

            {podeCancelar && (
              <button
                onClick={() => { setExpandido(false); setConfirmCancel(true) }}
                className="ml-auto flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                <Trash2 size={13} />
                Cancelar ordem
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
