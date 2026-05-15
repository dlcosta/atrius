'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, Plus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ItemDemanda, Ordem, Tanque } from '@/types'
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
  ordensAgendadas: Ordem[]
  tanques: Tanque[]
  onBack: () => void
  onOrdemCriada: () => void
}

const TURNOS_PADRAO: Turno[] = [
  { id: 'manha', nome: 'Manhã', horaInicio: 6, horaFim: 14 },
  { id: 'tarde', nome: 'Tarde', horaInicio: 14, horaFim: 22 },
  { id: 'noite', nome: 'Noite', horaInicio: 22, horaFim: 6 },
]

const SEM_DATA_KEY = '__sem_data__'

function getDataKey(item: ItemDemanda) {
  return item.data_prevista?.slice(0, 10) || SEM_DATA_KEY
}

function getHojeYmd() {
  return format(new Date(), 'yyyy-MM-dd')
}

function formatDataSelecionada(data: string) {
  if (data === SEM_DATA_KEY) return 'sem entrega prevista'
  return format(parseISO(data), 'dd/MM/yyyy', { locale: ptBR })
}

function itemKey(item: ItemDemanda) {
  return `${item.numero_pedido}::${item.produto_descricao}::${item.data_prevista?.slice(0, 10) ?? ''}`
}

function turnoLabel(turnoId: string) {
  const turno = TURNOS_PADRAO.find((item) => item.id === turnoId)
  return turno ? `${turno.nome} (${turno.horaInicio}h - ${turno.horaFim}h)` : turnoId
}

export function TanqueSelector({
  dataSelecionada,
  categoriaSelecionada,
  itensIniciais,
  ordensAgendadas,
  tanques,
  onBack,
  onOrdemCriada,
}: Props) {
  const [tanqueSelecionado, setTanqueSelecionado] = useState<string | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [nomeOrdem, setNomeOrdem] = useState<string>('')
  const [diaExecucao, setDiaExecucao] = useState<string>(getHojeYmd())
  const [turnoId, setTurnoId] = useState<string>('manha')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Itens da categoria selecionada
  const itensDaCategoria = useMemo(() => {
    return itensIniciais.filter(
      (item) =>
        item.categoria_produto === categoriaSelecionada &&
        getDataKey(item) === dataSelecionada &&
        !item.alocado
    )
  }, [itensIniciais, categoriaSelecionada, dataSelecionada])

  const litrosDaCategoria = itensDaCategoria.reduce((acc, item) => acc + item.total_litros, 0)

  const litrosSelecionados = itensDaCategoria
    .filter((item) => selecionados.has(itemKey(item)))
    .reduce((acc, item) => acc + item.total_litros, 0)

  // Calcular utilização do tanque no dia/turno selecionado
  const utilizacaoTanque = useMemo(() => {
    if (!tanqueSelecionado || !ordensAgendadas) return { litros: 0, percentual: 0 }
    const tanque = tanques.find((t) => t.id === tanqueSelecionado)
    if (!tanque) return { litros: 0, percentual: 0 }

    const ordensNoTanque = ordensAgendadas.filter(
      (o) =>
        o.tank_id === tanqueSelecionado &&
        o.data_prevista?.slice(0, 10) === diaExecucao &&
        (o.turno_id ?? 'manha') === turnoId
    )

    console.log(`[TanqueSelector] Tanque ${tanqueSelecionado} em ${diaExecucao}:`, {
      ordensFound: ordensNoTanque.length,
      detalhes: ordensNoTanque.map(o => ({
        id: o.id,
        tank_id: o.tank_id,
        quantidade: o.quantidade,
        data: o.data_prevista
      }))
    })

    const litersUsados = ordensNoTanque.reduce((acc, o) => acc + (o.quantidade ?? 0), 0)
    const percentualUsado = (litersUsados / tanque.volume_liters) * 100

    return { litros: litersUsados, percentual: percentualUsado }
  }, [tanqueSelecionado, diaExecucao, turnoId, tanques, ordensAgendadas])

  const tanqueObj = tanques.find((t) => t.id === tanqueSelecionado)
  const capacidadeDisponivel = tanqueObj
    ? Math.max(0, tanqueObj.volume_liters - utilizacaoTanque.litros)
    : 0
  const podeAgendar = litrosSelecionados > 0 && litrosSelecionados <= capacidadeDisponivel
  const itensSelecionaveis = itensDaCategoria.filter((item) => item.total_litros <= capacidadeDisponivel)
  const todosSelecionados =
    itensSelecionaveis.length > 0 &&
    itensSelecionaveis.every((item) => selecionados.has(itemKey(item)))

  function handleChange(item: ItemDemanda, checked: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (checked) next.add(itemKey(item))
      else next.delete(itemKey(item))
      return next
    })
  }

  function handleSelecionarTodos(checked: boolean) {
    if (!checked) {
      setSelecionados(new Set())
      return
    }

    const next = new Set<string>()
    let litrosAcumulados = 0

    for (const item of itensDaCategoria) {
      const proximoTotal = litrosAcumulados + item.total_litros
      if (proximoTotal <= capacidadeDisponivel) {
        next.add(itemKey(item))
        litrosAcumulados = proximoTotal
      }
    }

    setSelecionados(next)
  }

  async function handleCriarOrdem() {
    if (!podeAgendar || !tanqueSelecionado || !nomeOrdem.trim() || !diaExecucao) return

    const itensSelecionados = itensDaCategoria.filter((item) => selecionados.has(itemKey(item)))

    const dataPrevista = itensSelecionados
      .map((i) => i.data_prevista?.slice(0, 10) ?? '')
      .filter(Boolean)
      .sort()[0] ?? diaExecucao

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
          tank_id: tanqueSelecionado,
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
          tank_id: tanqueSelecionado,
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
      setDiaExecucao(getHojeYmd())
      setTurnoId('manha')
      onOrdemCriada()
    } catch {
      setErro('Erro de rede ao criar ordem')
    } finally {
      setCriando(false)
    }
  }

  // Se tanque não foi selecionado, mostra seletor de tanque
  if (!tanqueSelecionado) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 mb-6 transition-colors"
        >
          <ChevronLeft size={16} />
          Voltar
        </button>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-blue-25 px-6 py-4 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-900">{categoriaSelecionada}</h2>
            <p className="text-sm text-slate-600 mt-1">Entrega prevista: {formatDataSelecionada(dataSelecionada)}</p>
            <p className="text-sm text-slate-700 mt-2">
              <span className="font-semibold">{litrosDaCategoria.toLocaleString('pt-BR')}L</span> a produzir em{' '}
              <span className="font-semibold">{itensDaCategoria.length}</span>{' '}
              {itensDaCategoria.length === 1 ? 'item' : 'itens'}
            </p>
          </div>

          <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Data de producao</label>
              <input
                type="date"
                value={diaExecucao}
                onChange={(e) => {
                  setDiaExecucao(e.target.value)
                  setSelecionados(new Set())
                }}
                className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Turno de producao</label>
              <select
                value={turnoId}
                onChange={(e) => {
                  setTurnoId(e.target.value)
                  setSelecionados(new Set())
                }}
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

          {/* Resumo de disponibilidade */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Disponibilidade em {format(parseISO(diaExecucao), 'dd/MM/yyyy', { locale: ptBR })} - {turnoLabel(turnoId)}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tanques.map((tanque) => {
                // Filtrar ordens que estão agendadas para este tanque e data
                const ordensNoTanque = (ordensAgendadas || []).filter((o) => {
                  const dataAgend = o.data_prevista?.slice(0, 10)
                  return (
                    o.tank_id === tanque.id &&
                    dataAgend === diaExecucao &&
                    (o.turno_id ?? 'manha') === turnoId
                  )
                })
                const litersUsados = ordensNoTanque.reduce((acc, o) => acc + (o.quantidade ?? 0), 0)
                const percentualUsado = (litersUsados / tanque.volume_liters) * 100
                const livres = tanque.volume_liters - litersUsados

                console.log(`Tanque ${tanque.id} (${diaExecucao}): ${litersUsados}L de ${tanque.volume_liters}L, ordens: ${ordensNoTanque.length}`)

                return (
                  <div key={tanque.id} className="bg-white rounded p-3 text-sm">
                    <div className="font-semibold text-slate-900">{tanque.nome}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      Livre: <span className="font-bold">{livres.toLocaleString('pt-BR')}L</span> / {litersUsados.toLocaleString('pt-BR')}L usado
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full transition-all ${
                          percentualUsado > 90 ? 'bg-red-500' : percentualUsado > 70 ? 'bg-orange-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(percentualUsado, 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{percentualUsado.toFixed(0)}% utilizado</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Seletor de tanque */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Escolher tanque para esta producao</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tanques.map((tanque) => (
                <button
                  key={tanque.id}
                  onClick={() => setTanqueSelecionado(tanque.id)}
                  className="p-4 rounded-lg border-2 border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition-all text-left"
                >
                  <div className="font-semibold text-slate-900">{tanque.nome}</div>
                  <div className="text-sm text-slate-600 mt-2">
                    {tanque.volume_liters.toLocaleString('pt-BR')}L
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>
    )
  }

  // Tanque selecionado, mostra formulário
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={() => setTanqueSelecionado(null)}
        className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 mb-6 transition-colors"
      >
        <ChevronLeft size={16} />
        Voltar para seleção de tanque
      </button>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-blue-25 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{categoriaSelecionada}</h2>
            <p className="text-sm text-slate-600 mt-1">
              Tanque: <span className="font-semibold">{tanqueObj?.nome}</span>
            </p>
            <p className="text-sm text-slate-700 mt-2">
              <span className="font-semibold">{litrosDaCategoria.toLocaleString('pt-BR')}L</span> a produzir em{' '}
              <span className="font-semibold">{itensDaCategoria.length}</span>{' '}
              {itensDaCategoria.length === 1 ? 'item' : 'itens'}
            </p>
          </div>
        </div>

        {/* Controles */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
          {/* Dia + Turno */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Dia de Execução</label>
              <input
                type="date"
                value={diaExecucao}
                onChange={(e) => setDiaExecucao(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

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

          {/* Disponibilidade */}
          <div className="bg-white rounded-lg p-3 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-900">Disponibilidade</span>
              <span className="text-sm font-bold text-slate-600">
                {((utilizacaoTanque.litros + litrosSelecionados) / (tanqueObj?.volume_liters ?? 1) * 100).toFixed(0)}%
                {' '} / {(capacidadeDisponivel - litrosSelecionados).toLocaleString('pt-BR')}L livres
              </span>
            </div>
            <TanqueProgressBar
              litrosSelecionados={utilizacaoTanque.litros + litrosSelecionados}
              capacidadeTanque={tanqueObj?.volume_liters ?? 0}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
              <span>Ja agendado: {utilizacaoTanque.litros.toLocaleString('pt-BR')}L</span>
              <span>Selecionado agora: {litrosSelecionados.toLocaleString('pt-BR')}L</span>
            </div>
          </div>
        </div>

        {/* Lista de itens */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700 mb-3">
            <span>Itens disponiveis ({itensDaCategoria.length})</span>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={todosSelecionados}
                disabled={itensDaCategoria.length === 0 || capacidadeDisponivel <= 0}
                onChange={(event) => handleSelecionarTodos(event.target.checked)}
                className="accent-blue-600"
              />
              Selecionar todos
            </label>
          </div>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {itensDaCategoria.map((item) => (
              <ItemPedidoRow
                key={itemKey(item)}
                item={item}
                selecionado={selecionados.has(itemKey(item))}
                bloqueado={litrosSelecionados >= (tanqueObj?.volume_liters ?? 0) && !selecionados.has(itemKey(item))}
                onChange={handleChange}
              />
            ))}
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div className="mx-6 my-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {erro}
          </div>
        )}

        {/* Nome + Botão */}
        {selecionados.size > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 space-y-3">
            <input
              type="text"
              placeholder="Digite um nome para a ordem..."
              value={nomeOrdem}
              onChange={(e) => setNomeOrdem(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleCriarOrdem}
              disabled={criando || !podeAgendar || !nomeOrdem.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Plus size={16} />
              {criando
                ? 'Criando...'
                : !podeAgendar
                  ? `Sem capacidade (precisa ${(litrosSelecionados - capacidadeDisponivel).toLocaleString('pt-BR')}L)`
                  : `Criar Ordem — ${litrosSelecionados.toLocaleString('pt-BR')}L`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
