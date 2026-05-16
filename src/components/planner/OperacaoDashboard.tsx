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
      return 'bg-slate-100 text-slate-600'
    case 'atrasada':
      return 'bg-red-100 text-red-700'
    case 'limpeza':
      return 'bg-amber-100 text-amber-700'
    case 'cancelada':
      return 'bg-zinc-100 text-zinc-600'
    default:
      return 'bg-blue-100 text-blue-700'
  }
}

function formatarDataHora(dataIso: string | null | undefined): string {
  if (!dataIso) return '--'
  return format(new Date(dataIso), 'dd/MM HH:mm', { locale: ptBR })
}

function ordenarPorInicio(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    const aTime = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    return aTime - bTime
  })
}

function maquinaTheme(nome: string): {
  cardBorder: string
  cardRing: string
  headerBg: string
  headerBorder: string
  title: string
  badgeBg: string
  badgeText: string
} {
  const n = nome.toUpperCase()
  if (n.includes('MAQ 1')) {
    return {
      cardBorder: 'border-[#BFDBFE]',
      cardRing: 'shadow-[inset_0_3px_0_0_#2563EB]',
      headerBg: 'bg-[#EFF6FF]',
      headerBorder: 'border-[#BFDBFE]',
      title: 'text-[#1D4ED8]',
      badgeBg: 'bg-[#DBEAFE]',
      badgeText: 'text-[#1E40AF]',
    }
  }
  if (n.includes('MAQ 2')) {
    return {
      cardBorder: 'border-[#FDE68A]',
      cardRing: 'shadow-[inset_0_3px_0_0_#D97706]',
      headerBg: 'bg-[#FFFBEB]',
      headerBorder: 'border-[#FDE68A]',
      title: 'text-[#B45309]',
      badgeBg: 'bg-[#FEF3C7]',
      badgeText: 'text-[#92400E]',
    }
  }
  if (n.includes('MAQ 3')) {
    return {
      cardBorder: 'border-[#BBF7D0]',
      cardRing: 'shadow-[inset_0_3px_0_0_#16A34A]',
      headerBg: 'bg-[#F0FDF4]',
      headerBorder: 'border-[#BBF7D0]',
      title: 'text-[#15803D]',
      badgeBg: 'bg-[#DCFCE7]',
      badgeText: 'text-[#166534]',
    }
  }
  return {
    cardBorder: 'border-[#E4E7EC]',
    cardRing: '',
    headerBg: 'bg-[#F7F8FA]',
    headerBorder: 'border-[#E4E7EC]',
    title: 'text-[#111827]',
    badgeBg: 'bg-white',
    badgeText: 'text-[#4B5563]',
  }
}

export function OperacaoDashboard({ maquinas, ordens, executandoOrdemId, onAcao }: Props) {
  const maquinasAtivas = maquinas.filter((m) => m.ativa)

  return (
    <section className="pb-4">
      <div className="rounded-[12px] border border-[#E4E7EC] bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[#111827]">Acompanhamento Operacional</h2>
            <p className="mt-1 text-[13px] text-[#9CA3AF]">Controle manual em tempo real por maquina.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-[8px] bg-[#F0FDF4] px-3 py-1.5 text-xs font-medium text-[#16A34A]">
            <span className="h-2 w-2 rounded-full bg-[#16A34A] [animation:status-pulse_2s_infinite]" />
            EM PRODUCAO
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {maquinasAtivas.map((maquina) => {
            const ordensDaMaquina = ordenarPorInicio(
              ordens.filter((ordem) => ordem.maquina_id === maquina.id && ordem.inicio_agendado)
            )
            const ordemProduzindo = ordensDaMaquina.find((ordem) => ordem.status === 'produzindo')
            const theme = maquinaTheme(maquina.nome)

            return (
              <div key={maquina.id} className={`overflow-hidden rounded-[8px] border bg-white ${theme.cardBorder} ${theme.cardRing}`}>
                <div className={`flex items-center justify-between border-b px-4 py-3 ${theme.headerBg} ${theme.headerBorder}`}>
                  <span className={`text-sm font-semibold ${theme.title}`}>{maquina.nome}</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${theme.badgeBg} ${theme.badgeText}`}>
                    {ordensDaMaquina.length} agendadas
                  </span>
                </div>

                {ordensDaMaquina.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-[#9CA3AF]">Sem ordens agendadas para esta maquina.</div>
                ) : (
                  <div className="max-h-56 divide-y divide-[#E4E7EC] overflow-y-auto">
                    {ordensDaMaquina.map((ordem) => {
                      const podeIniciar =
                        (ordem.status === 'aguardando' || ordem.status === 'atrasada') &&
                        (!ordemProduzindo || ordemProduzindo.id === ordem.id)
                      const podeFinalizar = ordem.status === 'produzindo' || ordem.status === 'limpeza'
                      const emExecucao = executandoOrdemId === ordem.id

                      return (
                        <div key={ordem.id} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-[#111827]">
                              {ordem.produto?.nome ?? ordem.produto_sku}
                            </span>
                            <span className={`ml-auto rounded-[6px] px-2 py-1 text-[10px] font-medium uppercase ${statusClass(ordem.status)}`}>
                              {ordem.status}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-[#9CA3AF]">
                            <span>Previsto: {formatarDataHora(ordem.inicio_agendado)}</span>
                            <span>Inicio real: {formatarDataHora(ordem.inicio_operacao_em)}</span>
                            <span>Fim real: {formatarDataHora(ordem.fim_operacao_em)}</span>
                            <span>
                              #{ordem.numero_externo} - {ordem.quantidade} {ordem.unidade}
                            </span>
                          </div>

                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => onAcao(ordem.id, 'iniciar')}
                              disabled={!podeIniciar || emExecucao}
                              className="h-9 flex-1 rounded-[8px] bg-[#2563EB] px-3 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {emExecucao && podeIniciar ? 'Iniciando...' : 'Iniciar'}
                            </button>
                            <button
                              onClick={() => onAcao(ordem.id, 'finalizar')}
                              disabled={!podeFinalizar || emExecucao}
                              className="h-9 flex-1 rounded-[8px] border border-[#CDD2DA] bg-white px-3 text-sm font-medium text-[#4B5563] hover:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:opacity-40"
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
