'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, Plus } from 'lucide-react'
import { format, parseISO, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ItemDemanda, Tanque } from '@/types'
import { TanqueProgressBar } from './TanqueProgressBar'
import { ItemPedidoRow } from './ItemPedidoRow'

type Turno = {
  id: string
  nome: string
  horaInicio: number
  horaFim: number
}

type Props = {
  dataSelecionada: string
  categoriaSelecionada: string
  itensIniciais: ItemDemanda[]
  tanques: Tanque[]
  onBack: () => void
  onOrdemCriada: () => void
}

const TURNOS_PADRAO: Turno[] = [
  { id: 'manha', nome: 'Manhã', horaInicio: 6, horaFim: 14 },
  { id: 'tarde', nome: 'Tarde', horaInicio: 14, horaFim: 22 },
  { id: 'noite', nome: 'Noite', horaInicio: 22, horaFim: 6 },
]

type ItemComProxDias = ItemDemanda & {
  diasAfrente: number
}

export function CategoriaSelector({
  dataSelecionada,
  categoriaSelecionada,
  itensIniciais,
  tanques,
  onBack,
  onOrdemCriada,
}: Props) {
  const [tanqueId, setTanqueId] = useState<string>(tanques[0]?.id ?? '')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [nomeOrdem, setNomeOrdem] = useState<string>('')
  const [diaExecucao, setDiaExecucao] = useState<string>(dataSelecionada)
  const [turnoId, setTurnoId] = useState<string>('manha')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const tanqueSelecionado = tanques.find((t) => t.id === tanqueId)
  const capacidade = tanqueSelecionado?.volume_liters ?? 0

  const litrosSelecionados = itensIniciais
    .filter(
      (item) =>
        selecionados.has(itemKey(item)) &&
        item.categoria_produto === categoriaSelecionada
    )
    .reduce((acc, item) => acc + item.total_litros, 0)

  const cheio = capacidade > 0 && litrosSelecionados >= capacidade

  function itemKey(item: ItemDemanda) {
    return `${item.numero_pedido}::${item.produto_descricao}::${item.data_prevista?.slice(0, 10) ?? ''}`
  }

  function handleChange(item: ItemDemanda, checked: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (checked) next.add(itemKey(item))
      else next.delete(itemKey(item))
      return next
    })
  }

  // Obter itens da categoria (dia selecionado + próximos dias)
  const itensPorData = useMemo(() => {
    const dataCurrent = parseISO(dataSelecionada)
    const porData = new Map<string, ItemComProxDias[]>()

    for (let i = 0; i < 30; i++) {
      const dataCheck = format(addDays(dataCurrent, i), 'yyyy-MM-dd')
      const itensDia = itensIniciais.filter(
        (item) =>
          item.categoria_produto === categoriaSelecionada &&
          item.data_prevista?.slice(0, 10) === dataCheck &&
          !item.alocado
      )

      if (itensDia.length > 0) {
        porData.set(dataCheck, itensDia.map((item) => ({ ...item, diasAfrente: i })))
      }
    }

    return Array.from(porData.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [dataSelecionada, categoriaSelecionada, itensIniciais])

  async function handleCriarOrdem() {
    if (selecionados.size === 0 || !tanqueId || !nomeOrdem.trim() || !diaExecucao) return

    const itensSelecionados = itensIniciais.filter(
      (item) =>
        selecionados.has(itemKey(item)) &&
        item.categoria_produto === categoriaSelecionada
    )

    const dataPrevista = itensSelecionados
      .map((i) => i.data_prevista?.slice(0, 10) ?? '')
      .filter(Boolean)
      .sort()[0] ?? ''

    const turno = TURNOS_PADRAO.find((t) => t.id === turnoId)
    if (!turno) {
      setErro('Turno inválido')
      return
    }

    setCriando(true)
    setErro(null)

    try {
      // 1. Criar ordem
      const resOrdem = await fetch('/api/demanda/ordens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria_produto: categoriaSelecionada,
          nome_ordem: nomeOrdem.trim(),
          data_prevista: dataPrevista,
          tank_id: tanqueId,
          total_litros: litrosSelecionados,
          itens: itensSelecionados.map((item) => ({
            numero_pedido: item.numero_pedido,
            produto_descricao: item.produto_descricao,
            quantidade: item.quantidade,
            total_litros: item.total_litros,
          })),
        }),
      })

      if (!resOrdem.ok) {
        const json = await resOrdem.json()
        setErro(json.error ?? 'Erro ao criar ordem')
        return
      }

      const ordem = await resOrdem.json()

      // 2. Agendar produção
      const resAgendamento = await fetch('/api/producao/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordem_id: ordem.id,
          tank_id: tanqueId,
          turno_id: turnoId,
          turno_nome: turno.nome,
          data_agendamento: diaExecucao,
        }),
      })

      if (!resAgendamento.ok) {
        const json = await resAgendamento.json()
        setErro(`Ordem criada mas erro ao agendar: ${json.error}`)
        return
      }

      setSelecionados(new Set())
      setNomeOrdem('')
      setDiaExecucao(dataSelecionada)
      setTurnoId('manha')
      onOrdemCriada()
    } catch {
      setErro('Erro de rede ao criar ordem')
    } finally {
      setCriando(false)
    }
  }

  const totalPendente = itensIniciais
    .filter((item) => item.categoria_produto === categoriaSelecionada && !item.alocado)
    .reduce((acc, item) => acc + item.total_litros, 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 mb-6 transition-colors"
      >
        <ChevronLeft size={16} />
        Voltar ao calendário
      </button>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Cabeçalho */}
        <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-blue-25 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{categoriaSelecionada}</h2>
            <p className="text-sm text-slate-600 mt-1">
              {format(parseISO(dataSelecionada), "EEEE, dd 'de' MMMM", { locale: ptBR })} •{' '}
              {totalPendente.toLocaleString('pt-BR')}L pendentes
            </p>
          </div>
        </div>

        {/* Controles tanque */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-600 shrink-0">Tanque:</label>
            <select
              value={tanqueId}
              onChange={(e) => {
                setTanqueId(e.target.value)
                setSelecionados(new Set())
              }}
              className="text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {tanques.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} ({t.volume_liters.toLocaleString('pt-BR')}L)
                </option>
              ))}
            </select>
          </div>
          <TanqueProgressBar
            litrosSelecionados={litrosSelecionados}
            capacidadeTanque={capacidade}
          />
        </div>

        {/* Lista de itens por data */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto space-y-4">
          {itensPorData.map(([dataKey, itensDia]) => (
            <div key={dataKey}>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-sm font-semibold text-slate-800">
                  {format(parseISO(dataKey), "dd 'de' MMMM", { locale: ptBR })}
                </div>
                {dataKey !== dataSelecionada && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    +{itensDia[0]?.diasAfrente || 0}d
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {itensDia.map((item) => (
                  <ItemPedidoRow
                    key={itemKey(item)}
                    item={item}
                    selecionado={selecionados.has(itemKey(item))}
                    bloqueado={cheio && !selecionados.has(itemKey(item))}
                    onChange={handleChange}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Erro */}
        {erro && (
          <div className="mx-6 my-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {erro}
          </div>
        )}

        {/* Formulário: Nome + Tanque + Dia + Turno + Botão */}
        {selecionados.size > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 space-y-3">
            {/* Nome da ordem */}
            <input
              type="text"
              placeholder="Digite um nome para a ordem..."
              value={nomeOrdem}
              onChange={(e) => setNomeOrdem(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Grid: Tanque + Dia + Turno */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Tanque */}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Tanque</label>
                <select
                  value={tanqueId}
                  onChange={(e) => setTanqueId(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {tanques.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dia de Execução */}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Dia de Execução</label>
                <input
                  type="date"
                  value={diaExecucao}
                  onChange={(e) => setDiaExecucao(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Turno */}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Turno</label>
                <select
                  value={turnoId}
                  onChange={(e) => setTurnoId(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TURNOS_PADRAO.map((turno) => (
                    <option key={turno.id} value={turno.id}>
                      {turno.nome} ({turno.horaInicio}h - {turno.horaFim}h)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Botão */}
            <button
              onClick={handleCriarOrdem}
              disabled={criando || !nomeOrdem.trim() || !diaExecucao}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Plus size={16} />
              {criando
                ? 'Criando...'
                : `Criar Ordem — ${litrosSelecionados.toLocaleString('pt-BR')}L`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
