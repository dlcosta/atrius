import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Maquina, Ordem } from '@/types'

type AcaoOperacao = 'iniciar' | 'finalizar'

type Props = {
  maquinas: Maquina[]
  ordens: Ordem[]
  executandoOrdemId: string | null
  onAcao: (ordemId: string, acao: AcaoOperacao) => Promise<void>
}

function statusClass(status: Ordem['status']): string {
  switch (status) {
    case 'produzindo':
      return 'bg-emerald-100 text-emerald-700'
    case 'concluida':
      return 'bg-slate-200 text-slate-700'
    case 'atrasada':
      return 'bg-red-100 text-red-700'
    case 'limpeza':
      return 'bg-amber-100 text-amber-700'
    case 'cancelada':
      return 'bg-zinc-200 text-zinc-700'
    default:
      return 'bg-blue-100 text-blue-700'
  }
}

function formatarDataHora(dataIso: string | null | undefined): string {
  if (!dataIso) return '--'
  return format(new Date(dataIso), "dd/MM HH:mm", { locale: ptBR })
}

function ordenarPorInicio(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    const aTime = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    return aTime - bTime
  })
}

export function OperacaoDashboard({ maquinas, ordens, executandoOrdemId, onAcao }: Props) {
  const maquinasAtivas = maquinas.filter((m) => m.ativa)

  const getMaquinaColorClass = (nome: string) => {
    const n = nome.toUpperCase()
    if (n.includes('MAQ 1')) return 'border-blue-500 bg-blue-50'
    if (n.includes('MAQ 2')) return 'border-yellow-400 bg-yellow-50'
    if (n.includes('MAQ 3')) return 'border-emerald-500 bg-emerald-50'
    return 'border-slate-200 bg-slate-50'
  }

  const getMaquinaBadgeClass = (nome: string) => {
    const n = nome.toUpperCase()
    if (n.includes('MAQ 1')) return 'bg-blue-600 text-white'
    if (n.includes('MAQ 2')) return 'bg-yellow-400 text-yellow-900'
    if (n.includes('MAQ 3')) return 'bg-emerald-600 text-white'
    return 'bg-white text-slate-500 border-slate-200'
  }

  return (
    <section className="px-4 pb-4">
      <div className="rounded-xl border-2 border-slate-300 bg-white p-6 shadow-md transition-all">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Acompanhamento Operacional</h2>
            <p className="text-sm font-bold text-slate-500">Controle manual em tempo real por máquina.</p>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-black text-emerald-700 uppercase">Em Produção</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {maquinasAtivas.map((maquina) => {
            const ordensDaMaquina = ordenarPorInicio(
              ordens.filter((ordem) => ordem.maquina_id === maquina.id && ordem.inicio_agendado)
            )
            const ordemProduzindo = ordensDaMaquina.find((ordem) => ordem.status === 'produzindo')

            return (
              <div key={maquina.id} className={`rounded-xl border-2 overflow-hidden bg-white shadow-sm transition-all hover:shadow-lg ${getMaquinaColorClass(maquina.nome).split(' ')[0]}`}>
                <div className={`px-5 py-4 border-b-2 flex items-center justify-between ${getMaquinaColorClass(maquina.nome)}`}>
                  <span className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{maquina.nome}</span>
                  <span className={`text-xs font-black px-3 py-1 rounded-full border shadow-sm ${getMaquinaBadgeClass(maquina.nome)}`}>
                    {ordensDaMaquina.length} OP'S AGENDADAS
                  </span>
                </div>

                {ordensDaMaquina.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-400">Sem ordens agendadas para esta maquina.</div>
                ) : (
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {ordensDaMaquina.map((ordem) => {
                      const podeIniciar =
                        (ordem.status === 'aguardando' || ordem.status === 'atrasada') &&
                        (!ordemProduzindo || ordemProduzindo.id === ordem.id)
                      const podeFinalizar = ordem.status === 'produzindo' || ordem.status === 'limpeza'
                      const emExecucao = executandoOrdemId === ordem.id

                      return (
                        <div key={ordem.id} className="px-5 py-4 bg-white/50">
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-black text-slate-900 truncate tracking-tight">
                              {ordem.produto?.nome ?? ordem.produto_sku}
                            </span>
                            <span className={`ml-auto px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider shadow-sm ${statusClass(ordem.status)}`}>
                              {ordem.status}
                            </span>
                          </div>

                          <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                            <span>Previsto: {formatarDataHora(ordem.inicio_agendado)}</span>
                            <span>Inicio real: {formatarDataHora(ordem.inicio_operacao_em)}</span>
                            <span>Fim real: {formatarDataHora(ordem.fim_operacao_em)}</span>
                            <span>
                              #{ordem.numero_externo} · {ordem.quantidade} {ordem.unidade}
                            </span>
                          </div>

                          <div className="mt-3 flex gap-3">
                            <button
                              onClick={() => onAcao(ordem.id, 'iniciar')}
                              disabled={!podeIniciar || emExecucao}
                              className="flex-1 py-3 rounded-lg text-sm font-black uppercase tracking-widest bg-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700 transition-all shadow-md active:scale-95"
                            >
                              {emExecucao && podeIniciar ? 'Iniciando...' : 'Iniciar'}
                            </button>
                            <button
                              onClick={() => onAcao(ordem.id, 'finalizar')}
                              disabled={!podeFinalizar || emExecucao}
                              className="flex-1 py-3 rounded-lg text-sm font-black uppercase tracking-widest bg-slate-800 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black transition-all shadow-md active:scale-95"
                            >
                              {emExecucao && podeFinalizar ? 'Finalizando...' : 'Finalizar'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
