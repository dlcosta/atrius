import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Maquina, Operador, Ordem } from '@/types'

type AcaoOperacao = 'iniciar' | 'pausar' | 'retomar' | 'finalizar'

type ResourceGroup = {
  id: string
  nome: string
  tipo: 'maquina' | 'tanque'
  ordens: Ordem[]
}

type Props = {
  maquinas: Maquina[]
  operadores: Operador[]
  ordens: Ordem[]
  executandoOrdemId: string | null
  operadorPorRecurso: Record<string, string>
  onSelecionarOperador: (recursoKey: string, operadorId: string) => void
  onAcao: (ordem: Ordem, acao: AcaoOperacao) => Promise<void>
}

function statusClass(status: Ordem['status']): string {
  switch (status) {
    case 'produzindo':
      return 'bg-emerald-100 text-emerald-700'
    case 'pausada':
      return 'bg-amber-100 text-amber-700'
    case 'concluida':
      return 'bg-slate-100 text-slate-600'
    case 'atrasada':
      return 'bg-red-100 text-red-700'
    case 'limpeza':
      return 'bg-orange-100 text-orange-700'
    case 'cancelada':
      return 'bg-zinc-100 text-zinc-600'
    default:
      return 'bg-blue-100 text-blue-700'
  }
}

function labelStatus(ordem: Ordem): string {
  if (ordem.status === 'produzindo') return 'Em andamento'
  if (ordem.status === 'pausada') return 'Pausado'
  if (ordem.status === 'concluida') return 'Concluído'
  if (ordem.planning_status === 'WAITING_TANK') return 'Aguardando tanque'
  return 'Programada'
}

function formatarDataHora(dataIso: string | null | undefined): string {
  if (!dataIso) return '--'
  return format(new Date(dataIso), 'dd/MM HH:mm', { locale: ptBR })
}

function formatarDuracaoRestante(ordem: Ordem): string {
  if (ordem.status === 'pausada' && ordem.tempo_restante_pausado_seg) {
    const totalSeg = Math.max(0, ordem.tempo_restante_pausado_seg)
    const h = Math.floor(totalSeg / 3600)
    const m = Math.floor((totalSeg % 3600) / 60)
    const s = totalSeg % 60
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
  }

  if (!ordem.fim_calculado) return '--:--:--'
  const restanteMs = Math.max(0, new Date(ordem.fim_calculado).getTime() - Date.now())
  const totalSeg = Math.floor(restanteMs / 1000)
  const h = Math.floor(totalSeg / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  const s = totalSeg % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

function ordenarPorInicio(ordens: Ordem[]): Ordem[] {
  return [...ordens].sort((a, b) => {
    const aTime = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : Number.MAX_SAFE_INTEGER
    return aTime - bTime
  })
}

function maquinaTheme(nome: string) {
  const n = nome.toUpperCase()
  if (n.includes('MAQ 1')) {
    return ['border-[#BFDBFE]', 'shadow-[inset_0_3px_0_0_#2563EB]', 'bg-[#EFF6FF]', 'border-[#BFDBFE]', 'text-[#1D4ED8]', 'bg-[#DBEAFE]', 'text-[#1E40AF]']
  }
  if (n.includes('MAQ 2')) {
    return ['border-[#FDE68A]', 'shadow-[inset_0_3px_0_0_#D97706]', 'bg-[#FFFBEB]', 'border-[#FDE68A]', 'text-[#B45309]', 'bg-[#FEF3C7]', 'text-[#92400E]']
  }
  if (n.includes('MAQ 3')) {
    return ['border-[#BBF7D0]', 'shadow-[inset_0_3px_0_0_#16A34A]', 'bg-[#F0FDF4]', 'border-[#BBF7D0]', 'text-[#15803D]', 'bg-[#DCFCE7]', 'text-[#166534]']
  }
  return ['border-[#E4E7EC]', '', 'bg-[#F7F8FA]', 'border-[#E4E7EC]', 'text-[#111827]', 'bg-white', 'text-[#4B5563]']
}

function montarGrupos(maquinas: Maquina[], ordens: Ordem[]): ResourceGroup[] {
  const gruposMaquina = maquinas
    .filter((m) => m.ativa)
    .map((maquina) => ({
      id: maquina.id,
      nome: maquina.nome,
      tipo: 'maquina' as const,
      ordens: ordenarPorInicio(ordens.filter((ordem) => ordem.maquina_id === maquina.id && ordem.inicio_agendado)),
    }))

  const mapaTanques = new Map<string, ResourceGroup>()
  ordens
    .filter((ordem) => ordem.etapa === 'tanque' && ordem.inicio_agendado)
    .forEach((ordem, index) => {
      const key = ordem.tank_id ?? ordem.tanque ?? `tanque-${index}`
      const nome = ordem.tanque ?? ordem.tanque_ref?.nome ?? `Tanque ${index + 1}`
      if (!mapaTanques.has(key)) {
        mapaTanques.set(key, { id: key, nome, tipo: 'tanque', ordens: [] })
      }
      mapaTanques.get(key)?.ordens.push(ordem)
    })

  const gruposTanque = Array.from(mapaTanques.values()).map((grupo) => ({
    ...grupo,
    ordens: ordenarPorInicio(grupo.ordens),
  }))

  return [...gruposMaquina, ...gruposTanque]
}

function getResourceKey(grupo: ResourceGroup) {
  return grupo.tipo === 'maquina' ? `machine:${grupo.id}` : `tank:${grupo.id}`
}

function ResourceSection({
  titulo,
  operadores,
  grupos,
  executandoOrdemId,
  operadorPorRecurso,
  onSelecionarOperador,
  onAcao,
}: {
  titulo: string
  operadores: Operador[]
  grupos: ResourceGroup[]
  executandoOrdemId: string | null
  operadorPorRecurso: Record<string, string>
  onSelecionarOperador: (recursoKey: string, operadorId: string) => void
  onAcao: (ordem: Ordem, acao: AcaoOperacao) => Promise<void>
}) {
  if (grupos.length === 0) return null

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#111827]">{titulo}</h3>
        <span className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">
          Seleção de operador por recurso
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {grupos.map((grupo) => {
          const [cardBorder, cardRing, headerBg, headerBorder, title, badgeBg, badgeText] = maquinaTheme(grupo.nome)
          const ordemBloqueante = grupo.ordens.find((ordem) => ordem.status === 'produzindo' || ordem.status === 'pausada')
          const recursoKey = getResourceKey(grupo)
          const operadorSelecionadoId = operadorPorRecurso[recursoKey] ?? ''
          const operadorSelecionado = operadores.find((operador) => operador.id === operadorSelecionadoId) ?? null

          return (
            <div key={grupo.id} className={`overflow-hidden rounded-[8px] border bg-white ${cardBorder} ${cardRing}`}>
              <div className={`flex items-center justify-between border-b px-4 py-3 ${headerBg} ${headerBorder}`}>
                <div>
                  <span className={`text-sm font-semibold ${title}`}>{grupo.nome}</span>
                  <div className="mt-2">
                    <select
                      value={operadorSelecionadoId}
                      onChange={(e) => onSelecionarOperador(recursoKey, e.target.value)}
                      className="h-8 min-w-52 rounded-[8px] border border-[#D0D5DD] bg-white px-3 text-xs text-[#111827]"
                    >
                      <option value="">Selecione o operador...</option>
                      {operadores.map((operador) => (
                        <option key={operador.id} value={operador.id}>
                          {operador.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${badgeBg} ${badgeText}`}>
                    {grupo.ordens.length} ordens
                  </span>
                  <div className="mt-2 text-[11px] text-[#667085]">
                    Operador: <span className="font-semibold">{operadorSelecionado?.nome ?? '--'}</span>
                  </div>
                </div>
              </div>

              {grupo.ordens.length === 0 ? (
                <div className="px-4 py-4 text-xs text-[#9CA3AF]">Sem ordens programadas para este recurso.</div>
              ) : (
                <div className="max-h-72 divide-y divide-[#E4E7EC] overflow-y-auto">
                  {grupo.ordens.map((ordem) => {
                    const podeIniciar =
                      ordem.status === 'aguardando' &&
                      ordem.planning_status !== 'WAITING_TANK' &&
                      (!ordemBloqueante || ordemBloqueante.id === ordem.id)
                    const podePausar = ordem.status === 'produzindo'
                    const podeRetomar =
                      ordem.status === 'pausada' &&
                      (!ordemBloqueante || ordemBloqueante.id === ordem.id)
                    const podeFinalizar = ordem.status === 'produzindo' || ordem.status === 'pausada' || ordem.status === 'limpeza'
                    const semOperadorSelecionado = !operadorSelecionadoId
                    const emExecucao = executandoOrdemId === ordem.id

                    return (
                      <div key={ordem.id} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[#111827]">
                            {ordem.produto?.nome ?? ordem.produto_sku}
                          </span>
                          <span className={`ml-auto rounded-[6px] px-2 py-1 text-[10px] font-medium uppercase ${statusClass(ordem.status)}`}>
                            {labelStatus(ordem)}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-[#9CA3AF]">
                          <span>Previsto: {formatarDataHora(ordem.inicio_agendado)}</span>
                          <span>Início real: {formatarDataHora(ordem.inicio_operacao_em)}</span>
                          <span>Fim real: {formatarDataHora(ordem.fim_operacao_em)}</span>
                          <span>Timer: {formatarDuracaoRestante(ordem)}</span>
                          <span>Operador: {ordem.operador_nome ?? '--'}</span>
                          <span>
                            #{ordem.numero_externo} - {ordem.quantidade} {ordem.unidade}
                          </span>
                        </div>

                        {ordem.planning_status === 'WAITING_TANK' && (
                          <div className="mt-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Esta ordem aguarda a conclusão do tanque de origem para poder iniciar.
                          </div>
                        )}

                        {semOperadorSelecionado && (
                          <div className="mt-2 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            Selecione um operador para liberar as ações desse recurso.
                          </div>
                        )}

                        {ordem.observacao_pausa && (
                          <div className="mt-2 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Motivo da pausa: {ordem.observacao_pausa}
                          </div>
                        )}

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => onAcao(ordem, podeRetomar ? 'retomar' : 'iniciar')}
                            disabled={(!podeIniciar && !podeRetomar) || emExecucao || semOperadorSelecionado}
                            className="h-9 rounded-[8px] bg-[#2563EB] px-3 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {emExecucao && (podeIniciar || podeRetomar)
                              ? podeRetomar ? 'Retomando...' : 'Iniciando...'
                              : podeRetomar ? 'Retomar' : 'Iniciar'}
                          </button>
                          <button
                            onClick={() => onAcao(ordem, 'pausar')}
                            disabled={!podePausar || emExecucao || semOperadorSelecionado}
                            className="h-9 rounded-[8px] border border-[#D97706] bg-white px-3 text-sm font-medium text-[#D97706] hover:bg-[#FFF7ED] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {emExecucao && podePausar ? 'Pausando...' : 'Pausar'}
                          </button>
                          <button
                            onClick={() => onAcao(ordem, 'finalizar')}
                            disabled={!podeFinalizar || emExecucao || semOperadorSelecionado}
                            className="col-span-2 h-9 rounded-[8px] border border-[#CDD2DA] bg-white px-3 text-sm font-medium text-[#4B5563] hover:bg-[#F7F8FA] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {emExecucao && podeFinalizar ? 'Finalizando...' : 'Concluir'}
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
  )
}

export function OperacaoDashboard({
  maquinas,
  operadores,
  ordens,
  executandoOrdemId,
  operadorPorRecurso,
  onSelecionarOperador,
  onAcao,
}: Props) {
  const grupos = montarGrupos(maquinas, ordens)
  const gruposMaquina = grupos.filter((grupo) => grupo.tipo === 'maquina')
  const gruposTanque = grupos.filter((grupo) => grupo.tipo === 'tanque')

  return (
    <section className="space-y-6 pb-4">
      <div className="rounded-[12px] border border-[#E4E7EC] bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[#111827]">Acompanhamento Operacional</h2>
            <p className="mt-1 text-[13px] text-[#9CA3AF]">Status de programada, em andamento, pausada e concluída por recurso.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-[8px] bg-[#F0FDF4] px-3 py-1.5 text-xs font-medium text-[#16A34A]">
            <span className="h-2 w-2 rounded-full bg-[#16A34A] [animation:status-pulse_2s_infinite]" />
            OPERAÇÃO AO VIVO
          </div>
        </div>

        <div className="space-y-6">
          <ResourceSection
            titulo="Envase por Máquina"
            operadores={operadores}
            grupos={gruposMaquina}
            executandoOrdemId={executandoOrdemId}
            operadorPorRecurso={operadorPorRecurso}
            onSelecionarOperador={onSelecionarOperador}
            onAcao={onAcao}
          />
          <ResourceSection
            titulo="Tanques"
            operadores={operadores}
            grupos={gruposTanque}
            executandoOrdemId={executandoOrdemId}
            operadorPorRecurso={operadorPorRecurso}
            onSelecionarOperador={onSelecionarOperador}
            onAcao={onAcao}
          />
        </div>
      </div>
    </section>
  )
}
