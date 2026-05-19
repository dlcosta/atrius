'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronDown, ChevronRight, Plus, AlertTriangle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ItemDemandaEnvase, Maquina, Ordem } from '@/types'

type Props = {
  dataSelecionada: string
  grupoProdutoBase: string
  grupoEmbalagemLabel: string
  grupoEmbalagemVolumeMl: number
  itensIniciais: ItemDemandaEnvase[]
  maquinas: Maquina[]
  ordensTanque: Ordem[]
  onBack: () => void
  onOrdemCriada: () => void
}

const SEM_DATA_KEY = '__sem_data__'

function getHojeYmd() {
  return format(new Date(), 'yyyy-MM-dd')
}

function itemKey(item: ItemDemandaEnvase) {
  return `${item.numero_pedido}::${item.produto_descricao}::${item.data_prevista?.slice(0, 10) ?? ''}`
}

function fmtMin(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h${min > 0 ? String(min).padStart(2, '0') : ''}` : `${min}min`
}

export function MaquinaSelector({
  dataSelecionada,
  grupoProdutoBase,
  grupoEmbalagemLabel,
  grupoEmbalagemVolumeMl,
  itensIniciais,
  maquinas,
  ordensTanque,
  onBack,
  onOrdemCriada,
}: Props) {
  const [maquinaId, setMaquinaId] = useState<string>(maquinas[0]?.id ?? '')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [nomeOrdem, setNomeOrdem] = useState<string>('')
  const [diaExecucao, setDiaExecucao] = useState<string>(getHojeYmd())
  const [originTankOrderId, setOriginTankOrderId] = useState<string>('')
  const [tempoProducaoMin, setTempoProducaoMin] = useState<number | null>(null)
  const [tempoLimpezaMin, setTempoLimpezaMin] = useState<number>(0)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const tituloGrupo = `${grupoProdutoBase} ${grupoEmbalagemLabel}`

  // Items matching this product+embalagem group, not yet allocated
  const itensDoGrupo = useMemo(() => {
    return itensIniciais.filter((item) => {
      if (item.produto_base !== grupoProdutoBase) return false
      if (item.embalagem_volume_ml !== grupoEmbalagemVolumeMl) return false
      if (item.alocado) return false
      const itemData = item.data_prevista?.slice(0, 10) || ''
      const dataBase = dataSelecionada === SEM_DATA_KEY ? '' : dataSelecionada
      return !dataBase || !itemData || itemData >= dataBase
    })
  }, [itensIniciais, grupoProdutoBase, grupoEmbalagemVolumeMl, dataSelecionada])

  const totalLitrosGrupo = itensDoGrupo.reduce((acc, i) => acc + i.total_litros, 0)

  const itensSelecionadosList = itensDoGrupo.filter((item) => selecionados.has(itemKey(item)))
  const litrosSelecionados = itensSelecionadosList.reduce((acc, i) => acc + i.total_litros, 0)
  const embalagensSelecionadas = itensSelecionadosList.reduce(
    (acc, i) => acc + i.quantidade * i.unidades_por_cx,
    0
  )

  const todosSelecionados =
    itensDoGrupo.length > 0 && itensDoGrupo.every((i) => selecionados.has(itemKey(i)))

  const temItemManual = itensSelecionadosList.some((i) => i.confianca_embalagem === 'manual')

  // Tank orders filtered by product name similarity
  const tanquesFiltrados = useMemo(() => {
    const base = grupoProdutoBase.toLowerCase()
    return ordensTanque.filter((o) => {
      const tanqueNome = (o.tanque ?? '').toLowerCase()
      return tanqueNome.includes(base) || base.includes(tanqueNome.split(' ')[0] ?? '')
    })
  }, [ordensTanque, grupoProdutoBase])

  const totalDuracaoMin = (tempoProducaoMin ?? 0) + tempoLimpezaMin

  const podeAgendar =
    litrosSelecionados > 0 &&
    tempoProducaoMin !== null &&
    tempoProducaoMin > 0 &&
    nomeOrdem.trim().length > 0 &&
    maquinaId.length > 0

  function handleChange(item: ItemDemandaEnvase, checked: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (checked) next.add(itemKey(item))
      else next.delete(itemKey(item))
      return next
    })
  }

  function handleSelecionarTodos(checked: boolean) {
    setSelecionados(checked ? new Set(itensDoGrupo.map(itemKey)) : new Set())
  }

  async function handleCriarOrdem() {
    if (!podeAgendar) return

    const maquina = maquinas.find((m) => m.id === maquinaId)
    const dataPrevista =
      itensSelecionadosList
        .map((i) => i.data_prevista?.slice(0, 10) ?? '')
        .filter(Boolean)
        .sort()[0] ?? diaExecucao

    const itensPayload = itensSelecionadosList.map((item) => ({
      numero_pedido: item.numero_pedido,
      produto_descricao: item.produto_descricao,
      quantidade: item.quantidade,
      total_litros: item.total_litros,
    }))

    // Find the first item to get packaging details
    const ref = itensSelecionadosList[0]!

    setCriando(true)
    setErro(null)

    try {
      const res = await fetch('/api/envase/ordens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_base: grupoProdutoBase,
          embalagem_label: grupoEmbalagemLabel,
          embalagem_volume_ml: grupoEmbalagemVolumeMl,
          nome_ordem: nomeOrdem.trim(),
          data_prevista: dataPrevista,
          maquina_id: maquinaId || null,
          origin_tank_order_id: originTankOrderId || null,
          total_litros: litrosSelecionados,
          total_embalagens: embalagensSelecionadas,
          package_volume_liters: ref.litros_por_unidade,
          units_per_box: ref.unidades_por_cx,
          production_time_minutes: tempoProducaoMin,
          cleaning_time_minutes: tempoLimpezaMin,
          itens: itensPayload,
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        setErro(json.error ?? 'Erro ao criar ordem')
        return
      }

      setSelecionados(new Set())
      setNomeOrdem('')
      setTempoProducaoMin(null)
      setTempoLimpezaMin(0)
      setOriginTankOrderId('')
      onOrdemCriada()
    } catch {
      setErro('Erro de rede ao criar ordem')
    } finally {
      setCriando(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 mb-6 transition-colors"
      >
        <ChevronLeft size={16} />
        Voltar
      </button>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-50 to-emerald-25 px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">{tituloGrupo}</h2>
          <p className="text-sm text-slate-600 mt-1">
            {dataSelecionada === SEM_DATA_KEY
              ? 'Sem entrega prevista'
              : `Entrega prevista: ${format(parseISO(dataSelecionada), 'dd/MM/yyyy', { locale: ptBR })}`}
          </p>
          <p className="text-sm text-slate-700 mt-2">
            <span className="font-semibold">{totalLitrosGrupo.toLocaleString('pt-BR')}L</span> a envasar em{' '}
            <span className="font-semibold">{itensDoGrupo.length}</span>{' '}
            {itensDoGrupo.length === 1 ? 'item' : 'itens'}
          </p>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Data de produção</label>
              <input
                type="date"
                value={diaExecucao}
                onChange={(e) => setDiaExecucao(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Máquina de envase</label>
              {maquinas.length === 0 ? (
                <p className="text-sm text-amber-600 py-2">Nenhuma máquina cadastrada.</p>
              ) : (
                <select
                  value={maquinaId}
                  onChange={(e) => setMaquinaId(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {maquinas.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Origin tank (optional) */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Tanque de origem{' '}
              <span className="font-normal text-slate-400">(opcional — vincula ao lote do tanque)</span>
            </label>
            <select
              value={originTankOrderId}
              onChange={(e) => setOriginTankOrderId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Sem vínculo de tanque</option>
              {tanquesFiltrados.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.tanque ?? o.numero_externo} — {o.quantidade.toLocaleString('pt-BR')}L{' '}
                  [{o.planning_status}]
                </option>
              ))}
              {tanquesFiltrados.length === 0 && ordensTanque.length > 0 && (
                <optgroup label="Todos os tanques">
                  {ordensTanque.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.tanque ?? o.numero_externo} — {o.quantidade.toLocaleString('pt-BR')}L{' '}
                      [{o.planning_status}]
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {originTankOrderId && (() => {
              const tanque = ordensTanque.find((o) => o.id === originTankOrderId)
              if (!tanque) return null
              if (tanque.planning_status !== 'COMPLETED') {
                return (
                  <p className="text-xs text-purple-600 font-medium mt-1">
                    Tanque ainda em produção — ordem criada com status <strong>Aguardando Tanque</strong>
                  </p>
                )
              }
              return (
                <p className="text-xs text-emerald-600 font-medium mt-1">
                  Tanque concluído — ordem entrará direto no backlog
                </p>
              )
            })()}
          </div>
        </div>

        {/* Item list */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700 mb-3">
            <span>Itens disponíveis ({itensDoGrupo.length})</span>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={todosSelecionados}
                disabled={itensDoGrupo.length === 0}
                onChange={(e) => handleSelecionarTodos(e.target.checked)}
                className="accent-emerald-600"
              />
              Selecionar todos
            </label>
          </div>

          {itensDoGrupo.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Nenhum item disponível</p>
          ) : (
            <div className="space-y-3">
              {(() => {
                const porData = new Map<string, ItemDemandaEnvase[]>()
                for (const item of itensDoGrupo) {
                  const k = item.data_prevista?.slice(0, 10) || SEM_DATA_KEY
                  if (!porData.has(k)) porData.set(k, [])
                  porData.get(k)!.push(item)
                }
                const datasOrdenadas = Array.from(porData.keys()).sort((a, b) => {
                  if (a === SEM_DATA_KEY) return 1
                  if (b === SEM_DATA_KEY) return -1
                  return a.localeCompare(b)
                })
                return datasOrdenadas.map((dataKey) => (
                  <div key={dataKey}>
                    <div className="text-xs font-bold text-emerald-700 px-3 py-2">
                      Entrega:{' '}
                      {dataKey === SEM_DATA_KEY
                        ? 'Sem data'
                        : format(parseISO(dataKey), 'dd/MM/yyyy', { locale: ptBR })}
                    </div>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                      {porData.get(dataKey)!.map((item) => {
                        const key = itemKey(item)
                        const sel = selecionados.has(key)
                        const exp = expandidos.has(key)
                        const totalEmb = item.quantidade * item.unidades_por_cx
                        return (
                          <div
                            key={key}
                            className={`transition-colors ${
                              sel ? 'bg-emerald-50 border-l-2 border-l-emerald-500' : 'hover:bg-slate-50'
                            }`}
                          >
                            {/* Linha principal */}
                            <div className="flex items-start gap-3 px-4 py-3">
                              <input
                                type="checkbox"
                                checked={sel}
                                onChange={(e) => handleChange(item, e.target.checked)}
                                className="mt-1 accent-emerald-600 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-slate-800 truncate">
                                    Pedido {item.numero_pedido} — {item.cliente_nome}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-sm font-bold text-slate-700">
                                      {item.total_litros.toLocaleString('pt-BR')}L
                                    </span>
                                    <span className="text-xs text-slate-400">
                                      ({totalEmb.toLocaleString('pt-BR')} emb.)
                                    </span>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-500 truncate mt-0.5">{item.produto_descricao}</p>
                                {item.confianca_embalagem === 'manual' && (
                                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                    <AlertTriangle size={10} />
                                    Parsing manual — verifique o volume
                                  </span>
                                )}
                              </div>
                              {/* Toggle detalhes */}
                              <button
                                onClick={() => setExpandidos((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(key)) next.delete(key)
                                  else next.add(key)
                                  return next
                                })}
                                className="shrink-0 mt-0.5 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                                title="Ver detalhes do ERP"
                              >
                                {exp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </div>

                            {/* Painel de detalhes ERP */}
                            {exp && (
                              <div className="mx-4 mb-3 rounded-lg border border-slate-200 bg-white overflow-hidden text-xs">
                                <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">
                                  Dados do pedido ERP
                                </div>
                                <table className="w-full">
                                  <tbody>
                                    <tr className="border-b border-slate-100">
                                      <td className="px-3 py-2 text-slate-500 w-40">Nº Pedido</td>
                                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.numero_pedido}</td>
                                    </tr>
                                    <tr className="border-b border-slate-100">
                                      <td className="px-3 py-2 text-slate-500">Cliente</td>
                                      <td className="px-3 py-2 text-slate-700">{item.cliente_nome}</td>
                                    </tr>
                                    <tr className="border-b border-slate-100">
                                      <td className="px-3 py-2 text-slate-500">Descrição ERP</td>
                                      <td className="px-3 py-2 font-mono text-slate-700">{item.produto_descricao}</td>
                                    </tr>
                                    <tr className="border-b border-slate-100 bg-blue-50">
                                      <td className="px-3 py-2 text-blue-700 font-semibold">Qtd. ERP</td>
                                      <td className="px-3 py-2 font-mono font-bold text-blue-800">
                                        {item.quantidade.toLocaleString('pt-BR')}{' '}
                                        <span className="font-normal text-blue-600">
                                          {item.unidades_por_cx > 1 ? 'cx' : 'un'}
                                        </span>
                                        <span className="ml-2 text-[10px] font-normal text-blue-500">(campo: quantidade)</span>
                                      </td>
                                    </tr>
                                    <tr className="border-b border-slate-100">
                                      <td className="px-3 py-2 text-slate-500">Un./caixa</td>
                                      <td className="px-3 py-2 font-mono text-slate-700">
                                        {item.unidades_por_cx}
                                        <span className="ml-2 text-[10px] text-slate-400">(extraído da descrição)</span>
                                      </td>
                                    </tr>
                                    <tr className="border-b border-slate-100">
                                      <td className="px-3 py-2 text-slate-500">Litros/un.</td>
                                      <td className="px-3 py-2 font-mono text-slate-700">
                                        {item.litros_por_unidade.toLocaleString('pt-BR')}L
                                        <span className="ml-2 text-[10px] text-slate-400">(extraído da descrição)</span>
                                      </td>
                                    </tr>
                                    <tr className="bg-emerald-50">
                                      <td className="px-3 py-2 text-emerald-700 font-semibold">Total</td>
                                      <td className="px-3 py-2 font-mono font-bold text-emerald-800">
                                        {item.quantidade} × {item.unidades_por_cx} × {item.litros_por_unidade}L ={' '}
                                        <span className="text-emerald-700">{item.total_litros.toLocaleString('pt-BR')}L</span>
                                        {item.unidades_por_cx > 1 && (
                                          <span className="text-emerald-600 font-normal ml-2">
                                            ({totalEmb.toLocaleString('pt-BR')} embalagens)
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </div>

        {/* Error */}
        {erro && (
          <div className="mx-6 my-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {erro}
          </div>
        )}

        {/* Form — shown when items are selected */}
        {selecionados.size > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 space-y-3">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-white border border-emerald-200 rounded-lg text-center">
              <div>
                <div className="text-lg font-bold text-emerald-700">{litrosSelecionados.toLocaleString('pt-BR')}L</div>
                <div className="text-xs text-slate-500">Total litros</div>
              </div>
              <div>
                <div className="text-lg font-bold text-slate-800">{embalagensSelecionadas.toLocaleString('pt-BR')}</div>
                <div className="text-xs text-slate-500">Embalagens</div>
              </div>
              <div>
                <div className="text-lg font-bold text-slate-800">{grupoEmbalagemLabel}</div>
                <div className="text-xs text-slate-500">Formato</div>
              </div>
            </div>

            {temItemManual && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
                <AlertTriangle size={14} />
                Um ou mais itens têm parsing manual — confira se os volumes estão corretos antes de criar
              </div>
            )}

            <input
              type="text"
              placeholder="Nome da ordem (ex: Envase AMACIANTE ROSA 5L — Lote A)"
              value={nomeOrdem}
              onChange={(e) => setNomeOrdem(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Tempo de produção (min) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="ex: 120"
                  value={tempoProducaoMin ?? ''}
                  onChange={(e) => setTempoProducaoMin(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Tempo de limpeza (min)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="ex: 30"
                  value={tempoLimpezaMin}
                  onChange={(e) => setTempoLimpezaMin(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {totalDuracaoMin > 0 && (
              <p className="text-xs text-slate-500">
                Duração total da ordem: <span className="font-semibold text-slate-800">{fmtMin(totalDuracaoMin)}</span>
                {tempoLimpezaMin > 0 && (
                  <span className="text-slate-400"> (produção {fmtMin(tempoProducaoMin ?? 0)} + limpeza {fmtMin(tempoLimpezaMin)})</span>
                )}
              </p>
            )}

            <button
              onClick={handleCriarOrdem}
              disabled={criando || !podeAgendar}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Plus size={16} />
              {criando
                ? 'Criando...'
                : `Criar no Backlog — ${litrosSelecionados.toLocaleString('pt-BR')}L · ${embalagensSelecionadas.toLocaleString('pt-BR')} emb.`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
