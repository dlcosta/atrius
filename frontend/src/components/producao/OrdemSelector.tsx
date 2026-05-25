'use client'

import { X } from 'lucide-react'
import type { Ordem } from '@/types'

type Props = {
  ordem: Ordem
  onCancel: () => void
}

export function OrdemSelector({ ordem, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Agendar Ordem</h2>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-600" />
          </button>
        </div>

        <div className="space-y-3 mb-6 pb-4 border-b border-slate-200">
          <div>
            <div className="text-xs text-slate-600 uppercase font-semibold">Ordem</div>
            <div className="text-sm font-bold text-slate-900">{ordem.numero_externo || `Ordem ${ordem.id?.slice(0, 8)}`}</div>
          </div>
          <div>
            <div className="text-xs text-slate-600 uppercase font-semibold">Quantidade</div>
            <div className="text-sm font-bold text-slate-900">{ordem.quantidade?.toLocaleString('pt-BR')}L</div>
          </div>
          <div>
            <div className="text-xs text-slate-600 uppercase font-semibold">Categoria</div>
            <div className="text-sm font-bold text-slate-900">{ordem.tanque || 'Sem categoria'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-600 uppercase font-semibold">Data Prevista</div>
            <div className="text-sm font-bold text-slate-900">{ordem.data_prevista?.slice(0, 10) || 'Sem data'}</div>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          Clique em um tanque no calendário para agendar esta ordem.
        </p>

        <button
          onClick={onCancel}
          className="w-full px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
