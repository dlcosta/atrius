'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Plus, Calendar, XCircle, AlertCircle, Play, Pause,
  RotateCcw, CheckCircle2, Edit3, ChevronDown, ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import type { AuditLog, AuditOperacao } from '@/types'

type Props = {
  logs: AuditLog[]
  carregando?: boolean
}

type ConfigEvento = {
  icone: React.ElementType
  corIcone: string
  corLinha: string
  corBadge: string
  label: string
}

const CONFIG_EVENTOS: Record<AuditOperacao, ConfigEvento> = {
  CRIADO:          { icone: Plus,        corIcone: 'text-blue-600',   corLinha: 'bg-blue-200',   corBadge: 'bg-blue-100 text-blue-700',   label: 'Criado' },
  AGENDADO:        { icone: Calendar,    corIcone: 'text-indigo-600', corLinha: 'bg-indigo-200', corBadge: 'bg-indigo-100 text-indigo-700', label: 'Agendado' },
  REAGENDADO:      { icone: RotateCcw,   corIcone: 'text-amber-600',  corLinha: 'bg-amber-200',  corBadge: 'bg-amber-100 text-amber-700',  label: 'Reagendado' },
  CANCELADO:       { icone: XCircle,     corIcone: 'text-red-500',    corLinha: 'bg-red-200',    corBadge: 'bg-red-100 text-red-700',     label: 'Cancelado' },
  STATUS_ALTERADO: { icone: AlertCircle, corIcone: 'text-orange-500', corLinha: 'bg-orange-200', corBadge: 'bg-orange-100 text-orange-700', label: 'Status alterado' },
  EDITADO:         { icone: Edit3,       corIcone: 'text-slate-500',  corLinha: 'bg-slate-200',  corBadge: 'bg-slate-100 text-slate-600',  label: 'Editado' },
  INICIADO:        { icone: Play,        corIcone: 'text-green-600',  corLinha: 'bg-green-200',  corBadge: 'bg-green-100 text-green-700', label: 'Iniciado' },
  PAUSADO:         { icone: Pause,       corIcone: 'text-yellow-600', corLinha: 'bg-yellow-200', corBadge: 'bg-yellow-100 text-yellow-700', label: 'Pausado' },
  RETOMADO:        { icone: RotateCcw,   corIcone: 'text-teal-600',   corLinha: 'bg-teal-200',   corBadge: 'bg-teal-100 text-teal-700',   label: 'Retomado' },
  CONCLUIDO:       { icone: CheckCircle2,corIcone: 'text-emerald-600',corLinha: 'bg-emerald-200',corBadge: 'bg-emerald-100 text-emerald-700', label: 'Concluído' },
}

function EventoDetalhe({ log }: { log: AuditLog }) {
  const [aberto, setAberto] = useState(false)
  const temDados = log.dados_antes !== null || log.dados_depois !== null

  return (
    <div className="mt-1">
      {log.motivo && (
        <p className="text-xs text-slate-500 italic">Motivo: {log.motivo}</p>
      )}
      {log.responsavel && (
        <p className="text-xs text-slate-500">Responsável: <span className="font-medium text-slate-700">{log.responsavel}</span></p>
      )}
      {temDados && (
        <button
          onClick={() => setAberto(!aberto)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mt-1 transition-colors"
        >
          {aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {aberto ? 'Ocultar detalhes' : 'Ver detalhes'}
        </button>
      )}
      {aberto && temDados && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {log.dados_antes && (
            <div className="bg-red-50 border border-red-100 rounded p-2">
              <p className="text-xs font-semibold text-red-600 mb-1">Antes</p>
              <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all">{JSON.stringify(log.dados_antes, null, 2)}</pre>
            </div>
          )}
          {log.dados_depois && (
            <div className="bg-green-50 border border-green-100 rounded p-2">
              <p className="text-xs font-semibold text-green-600 mb-1">Depois</p>
              <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all">{JSON.stringify(log.dados_depois, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ProducaoTimeline({ logs, carregando }: Props) {
  if (carregando) {
    return (
      <div className="py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
        <span className="ml-2 text-sm text-slate-500">Carregando histórico...</span>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="py-6 text-center">
        <AlertCircle size={32} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-400">Nenhum evento registrado</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {logs.map((log, idx) => {
        const cfg = CONFIG_EVENTOS[log.operacao] ?? CONFIG_EVENTOS.EDITADO
        const Icone = cfg.icone
        const isLast = idx === logs.length - 1

        return (
          <div key={log.id} className="flex gap-3">
            {/* Coluna da linha vertical + ícone */}
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm bg-white ring-1 ring-slate-100`}>
                <Icone size={15} className={cfg.corIcone} />
              </div>
              {!isLast && (
                <div className={`w-0.5 flex-1 mt-1 mb-1 ${cfg.corLinha} min-h-[20px]`} />
              )}
            </div>

            {/* Conteúdo do evento */}
            <div className={`pb-4 ${isLast ? '' : ''} flex-1 min-w-0`}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.corBadge}`}>
                  {cfg.label}
                </span>
                <span className="text-xs text-slate-400 shrink-0">
                  {format(parseISO(log.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
              <p className="text-sm text-slate-700 mt-1">{log.descricao}</p>
              <EventoDetalhe log={log} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
