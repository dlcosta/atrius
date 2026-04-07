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

  return (
    <section className="px-4 pb-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Acompanhamento operacional</h2>
          <p className="text-xs text-slate-500">
            Controle manual de inicio e fim por programacao de cada maquina.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {maquinasAtivas.map((maquina) => {
            const ordensDaMaquina = ordenarPorInicio(
              ordens.filter((ordem) => ordem.maquina_id === maquina.id && ordem.inicio_agendado)
            )
            const ordemProduzindo = ordensDaMaquina.find((ordem) => ordem.status === 'produzindo')

            return (
              <div key={maquina.id} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">{maquina.nome}</span>
                  <span className="text-[11px] text-slate-500">{ordensDaMaquina.length} programacoes</span>
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
                        <div key={ordem.id} className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-800 truncate">
                              {ordem.produto?.nome ?? ordem.produto_sku}
                            </span>
                            <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusClass(ordem.status)}`}>
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

                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => onAcao(ordem.id, 'iniciar')}
                              disabled={!podeIniciar || emExecucao}
                              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700"
                            >
                              {emExecucao && podeIniciar ? 'Iniciando...' : 'Iniciar'}
                            </button>
                            <button
                              onClick={() => onAcao(ordem.id, 'finalizar')}
                              disabled={!podeFinalizar || emExecucao}
                              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-700 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800"
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
