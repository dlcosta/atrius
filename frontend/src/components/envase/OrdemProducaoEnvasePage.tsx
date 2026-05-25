'use client'
import { apiUrl } from '@/lib/api'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { Maquina, Ordem, Produto } from '@/types'
import {
  calculateProductionEndTime,
  calculateTotalDuration,
  hasScheduleConflict,
} from '@/lib/planning/production'
import { normalizarEmbalagem } from '@/lib/envase/normalizar-embalagem'

type Props = {
  maquinas: Maquina[]
  produtos: Produto[]
}

type TankOriginOption = {
  id: string
  source: 'novo_fluxo' | 'legado'
  numero_externo: string
  produto_sku: string | null
  lote: string | null
  litros_tanque: number
  litros_envasados: number
  saldo_litros: number
  balance_status: 'BALANCED' | 'UNDER' | 'OVER'
  planning_status: string | null
  data_prevista: string | null
}

type PackagedProductOption = {
  produto: Produto
  embalagemLabel: string
  litrosPorUnidade: number
  unidadesPorCaixa: number
  tipoAgrupamento: 'CX' | 'FD' | 'UN'
}

function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.00'
}

function inferirTipoAgrupamento(nomeProduto: string): 'CX' | 'FD' | 'UN' {
  const nome = nomeProduto.toUpperCase()
  if (nome.includes(' FD ') || nome.includes('FD C/')) return 'FD'
  if (nome.includes(' CX ') || nome.includes('CX C/')) return 'CX'
  return 'UN'
}

function labelAgrupamento(tipo: 'CX' | 'FD' | 'UN') {
  if (tipo === 'FD') return 'Fardos'
  if (tipo === 'CX') return 'Caixas'
  return 'Unidades'
}

function labelPlanningStatus(status: string | null): string {
  if (status === 'COMPLETED') return 'Concluído'
  if (status === 'IN_PRODUCTION') return 'Em andamento'
  if (status === 'PAUSED') return 'Pausado'
  if (status === 'WAITING_TANK') return 'Aguardando tanque'
  if (status === 'SCHEDULED') return 'Programado'
  return 'Aguardando'
}

export function OrdemProducaoEnvasePage({ maquinas, produtos }: Props) {
  const [origensTanque, setOrigensTanque] = useState<TankOriginOption[]>([])
  const [ordensDoDia, setOrdensDoDia] = useState<Ordem[]>([])
  const [carregandoOrigens, setCarregandoOrigens] = useState(false)
  const [carregandoAgenda, setCarregandoAgenda] = useState(false)
  const [originTankOrderId, setOriginTankOrderId] = useState('')
  const [produtoSku, setProdutoSku] = useState('')
  const [maquinaId, setMaquinaId] = useState(maquinas[0]?.id ?? '')
  const [dataProducao, setDataProducao] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [horaInicio, setHoraInicio] = useState('07:30')
  const [quantidadeAgrupamentos, setQuantidadeAgrupamentos] = useState('0')
  const [quantidadeUnidadesAvulsas, setQuantidadeUnidadesAvulsas] = useState('0')
  const [preparationTimeMinutes, setPreparationTimeMinutes] = useState('20')
  const [productionTimeMinutes, setProductionTimeMinutes] = useState('60')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    async function carregarOrigens() {
      setCarregandoOrigens(true)
      try {
        const response = await fetch(apiUrl('/api/novo-fluxo/tanques/origens'))
        const data = await response.json()
        setOrigensTanque(Array.isArray(data) ? (data as TankOriginOption[]) : [])
      } catch {
        setOrigensTanque([])
      } finally {
        setCarregandoOrigens(false)
      }
    }

    carregarOrigens()
  }, [])

  useEffect(() => {
    async function carregarAgendaDoDia() {
      setCarregandoAgenda(true)
      try {
        const response = await fetch(apiUrl(`/api/)novo-fluxo/envase?inicio=${dataProducao}&fim=${dataProducao}`)
        const data = await response.json()
        setOrdensDoDia(Array.isArray(data) ? data : [])
      } catch {
        setOrdensDoDia([])
      } finally {
        setCarregandoAgenda(false)
      }
    }

    carregarAgendaDoDia()
  }, [dataProducao])

  const produtosEnvase = useMemo<PackagedProductOption[]>(() => {
    return produtos
      .map((produto) => {
        const parsed = normalizarEmbalagem(produto.nome)
        if (parsed.litros_por_unidade <= 0 || parsed.embalagem_volume_ml <= 0) return null
        return {
          produto,
          embalagemLabel: parsed.embalagem_label,
          litrosPorUnidade: parsed.litros_por_unidade,
          unidadesPorCaixa: parsed.unidades_por_cx,
          tipoAgrupamento: inferirTipoAgrupamento(produto.nome),
        }
      })
      .filter(Boolean) as PackagedProductOption[]
  }, [produtos])

  const origemSelecionada = useMemo(
    () => origensTanque.find((item) => item.id === originTankOrderId) ?? null,
    [origensTanque, originTankOrderId]
  )

  const produtoSelecionado = useMemo(
    () => produtosEnvase.find((item) => item.produto.sku === produtoSku) ?? null,
    [produtosEnvase, produtoSku]
  )

  const totalDurationMinutes = useMemo(() => {
    return calculateTotalDuration({
      setupTimeMinutes: 0,
      productionTimeMinutes: Number(productionTimeMinutes || 0),
      cleaningTimeMinutes: Number(preparationTimeMinutes || 0),
    })
  }, [productionTimeMinutes, preparationTimeMinutes])

  const preview = useMemo(() => {
    const startAt = new Date(`${dataProducao}T${horaInicio}:00`)
    const endAt =
      startAt && Number.isFinite(startAt.getTime())
        ? calculateProductionEndTime(startAt, totalDurationMinutes)
        : null

    return { startAt, endAt }
  }, [dataProducao, horaInicio, totalDurationMinutes])

  const quantidadeAgrupamentosNumero = Math.max(0, Math.floor(Number(quantidadeAgrupamentos || 0)))
  const quantidadeUnidadesAvulsasNumero = Math.max(0, Math.floor(Number(quantidadeUnidadesAvulsas || 0)))
  const totalUnidades = useMemo(() => {
    if (!produtoSelecionado) return 0
    if (produtoSelecionado.unidadesPorCaixa <= 1) return quantidadeAgrupamentosNumero
    return quantidadeAgrupamentosNumero * produtoSelecionado.unidadesPorCaixa + quantidadeUnidadesAvulsasNumero
  }, [produtoSelecionado, quantidadeAgrupamentosNumero, quantidadeUnidadesAvulsasNumero])

  const totalLitros = useMemo(() => {
    if (!produtoSelecionado) return 0
    return totalUnidades * produtoSelecionado.litrosPorUnidade
  }, [produtoSelecionado, totalUnidades])

  const saldoLitros = origemSelecionada?.saldo_litros ?? 0
  const litrosRestantes = saldoLitros - totalLitros

  const ordensDaMaquinaNoDia = useMemo(() => {
    return ordensDoDia
      .filter((ordem) => ordem.etapa === 'envase')
      .filter((ordem) => ordem.maquina_id === maquinaId)
      .filter((ordem) => ordem.inicio_agendado && ordem.fim_calculado)
      .sort((a, b) => {
        const aMs = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : 0
        const bMs = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : 0
        return aMs - bMs
      })
  }, [ordensDoDia, maquinaId])

  const hasPreviewConflict = useMemo(() => {
    if (!maquinaId || !preview.startAt || !preview.endAt) return false

    return hasScheduleConflict({
      productionType: 'FILLING',
      machineId: maquinaId,
      newStart: preview.startAt,
      newEnd: preview.endAt,
      existingSchedules: ordensDaMaquinaNoDia,
    })
  }, [maquinaId, preview.startAt, preview.endAt, ordensDaMaquinaNoDia])

  const conflictingOrder = useMemo(() => {
    if (!preview.startAt || !preview.endAt) return null
    const previewEndAt = preview.endAt

    return (
      ordensDaMaquinaNoDia.find((ordem) => {
        if (!ordem.inicio_agendado || !ordem.fim_calculado) return false
        const inicioExistente = new Date(ordem.inicio_agendado)
        const fimExistente = new Date(ordem.fim_calculado)
        return preview.startAt < fimExistente && previewEndAt > inicioExistente
      }) ?? null
    )
  }, [preview.startAt, preview.endAt, ordensDaMaquinaNoDia])

  const conversionError = useMemo(() => {
    if (!origemSelecionada) return 'Selecione uma ordem de tanque vinculada.'
    if (!produtoSelecionado) return 'Selecione um produto de envase.'
    if (produtoSelecionado.unidadesPorCaixa > 1 && quantidadeUnidadesAvulsasNumero >= produtoSelecionado.unidadesPorCaixa) {
      return 'Unidades avulsas devem ser menores que a quantidade de unidades por caixa/fardo.'
    }
    if (totalUnidades <= 0) return 'Informe uma quantidade válida para envase.'
    if (litrosRestantes < 0) return 'A quantidade informada excede o saldo disponível no tanque.'
    return ''
  }, [origemSelecionada, produtoSelecionado, quantidadeUnidadesAvulsasNumero, totalUnidades, litrosRestantes])

  function resetForm() {
    setProdutoSku('')
    setMaquinaId(maquinas[0]?.id ?? '')
    setHoraInicio('07:30')
    setQuantidadeAgrupamentos('0')
    setQuantidadeUnidadesAvulsas('0')
    setPreparationTimeMinutes('20')
    setProductionTimeMinutes('60')
  }

  async function refreshOriginsAndAgenda() {
    try {
      const [origensRes, agendaRes] = await Promise.all([
        fetch(apiUrl('/api/novo-fluxo/tanques/origens')),
        fetch(apiUrl(`/api/)novo-fluxo/envase?inicio=${dataProducao}&fim=${dataProducao}`),
      ])
      const [origensData, agendaData] = await Promise.all([origensRes.json(), agendaRes.json()])
      setOrigensTanque(Array.isArray(origensData) ? (origensData as TankOriginOption[]) : [])
      setOrdensDoDia(Array.isArray(agendaData) ? agendaData : [])
    } catch {
      // Mantém os dados atuais em caso de falha pontual.
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSucesso('')

    if (conversionError) {
      setErro(conversionError)
      return
    }

    if (hasPreviewConflict) {
      setErro('Essa máquina já possui uma ordem agendada nesse intervalo.')
      return
    }

    if (!produtoSelecionado || !origemSelecionada) return

    setSalvando(true)
    try {
      const response = await fetch(apiUrl('/api/novo-fluxo/envase'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_sku: produtoSelecionado.produto.sku,
          origin_tank_order_id: origemSelecionada.id,
          origin_tank_source: origemSelecionada.source,
          maquina_id: maquinaId,
          data_prevista: dataProducao,
          inicio_agendado: new Date(`${dataProducao}T${horaInicio}:00`).toISOString(),
          nome_produto: produtoSelecionado.produto.nome,
          embalagem_label: produtoSelecionado.embalagemLabel,
          package_volume_liters: produtoSelecionado.litrosPorUnidade,
          units_per_box: produtoSelecionado.unidadesPorCaixa,
          quantidade_embalagens: produtoSelecionado.unidadesPorCaixa > 1 ? quantidadeAgrupamentosNumero : 0,
          quantidade_unidades_avulsas: produtoSelecionado.unidadesPorCaixa > 1 ? quantidadeUnidadesAvulsasNumero : totalUnidades,
          total_unidades: totalUnidades,
          total_litros: totalLitros,
          production_time_minutes: Number(productionTimeMinutes || 0),
          cleaning_time_minutes: Number(preparationTimeMinutes || 0),
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setErro(data.error ?? 'Erro ao criar ordem de envase')
        return
      }

      setSucesso(`Ordem de envase criada com sucesso${data?.numero_externo ? `: ${data.numero_externo}` : '.'}`)
      await refreshOriginsAndAgenda()
      resetForm()
    } catch {
      setErro('Erro de rede ao criar ordem de envase')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-[12px] border border-[#E4E7EC] bg-white p-6 shadow-[var(--shadow-sm)]">
        <div className="max-w-3xl">
          <span className="inline-flex rounded-full bg-[#ECFDF3] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#027A48]">
            Novo fluxo
          </span>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight text-[#111827]">
            Ordem de Produção - Envase
          </h1>
          <p className="mt-2 text-sm text-[#667085]">
            O envase nasce de uma ordem de tanque vinculada. Aqui convertemos o saldo em litros do tanque
            para caixas, fardos ou unidades do produto final.
          </p>
        </div>
      </section>

      <section className="rounded-[12px] border border-[#E4E7EC] bg-white p-6 shadow-[var(--shadow-sm)]">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Ordem de tanque vinculada</label>
              <select
                value={originTankOrderId}
                onChange={(e) => setOriginTankOrderId(e.target.value)}
                required
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              >
                <option value="">Selecione...</option>
                {origensTanque.map((origem) => (
                  <option key={origem.id} value={origem.id}>
                    {origem.numero_externo} · saldo {formatNumber(origem.saldo_litros, 2)}L · lote {origem.lote ?? '--'}
                  </option>
                ))}
              </select>
              {carregandoOrigens && <p className="mt-1 text-xs text-[#9CA3AF]">Carregando ordens de tanque...</p>}
              {origemSelecionada && !carregandoOrigens && (
                <p className="mt-1 text-xs text-[#667085]">
                  Status atual do tanque: <span className="font-semibold">{labelPlanningStatus(origemSelecionada.planning_status)}</span>
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Produto de envase</label>
              <select
                value={produtoSku}
                onChange={(e) => setProdutoSku(e.target.value)}
                required
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              >
                <option value="">Selecione...</option>
                {produtosEnvase.map((item) => (
                  <option key={item.produto.sku} value={item.produto.sku}>
                    {item.produto.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Data de produção</label>
              <input
                type="date"
                required
                value={dataProducao}
                onChange={(e) => setDataProducao(e.target.value)}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Hora de início</label>
              <input
                type="time"
                required
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Máquina de envase</label>
              <select
                value={maquinaId}
                onChange={(e) => setMaquinaId(e.target.value)}
                required
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              >
                <option value="">Selecione...</option>
                {maquinas.map((maquina) => (
                  <option key={maquina.id} value={maquina.id}>
                    {maquina.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {produtoSelecionado && (
            <div className="rounded-[8px] border border-[#E4E7EC] bg-[#F7F8FA] p-4 text-sm text-[#4B5563]">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div>
                  <span className="block text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Embalagem</span>
                  <span className="mt-1 block font-semibold text-[#111827]">{produtoSelecionado.embalagemLabel}</span>
                </div>
                <div>
                  <span className="block text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Litros por unidade</span>
                  <span className="mt-1 block font-semibold text-[#111827]">{formatNumber(produtoSelecionado.litrosPorUnidade, 3)} L</span>
                </div>
                <div>
                  <span className="block text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Unidades por agrupamento</span>
                  <span className="mt-1 block font-semibold text-[#111827]">{produtoSelecionado.unidadesPorCaixa}</span>
                </div>
                <div>
                  <span className="block text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Tipo de agrupamento</span>
                  <span className="mt-1 block font-semibold text-[#111827]">{labelAgrupamento(produtoSelecionado.tipoAgrupamento)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">
                {produtoSelecionado ? labelAgrupamento(produtoSelecionado.tipoAgrupamento) : 'Caixas/Fardos/Unidades'}
              </label>
              <input
                type="number"
                min={0}
                required
                value={quantidadeAgrupamentos}
                onChange={(e) => setQuantidadeAgrupamentos(e.target.value)}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              />
            </div>
            {produtoSelecionado && produtoSelecionado.unidadesPorCaixa > 1 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-[#4B5563]">Unidades avulsas</label>
                <input
                  type="number"
                  min={0}
                  value={quantidadeUnidadesAvulsas}
                  onChange={(e) => setQuantidadeUnidadesAvulsas(e.target.value)}
                  className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Etapa de Preparação (min)</label>
              <input
                type="number"
                min={0}
                required
                value={preparationTimeMinutes}
                onChange={(e) => setPreparationTimeMinutes(e.target.value)}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Produção (min)</label>
              <input
                type="number"
                min={1}
                required
                value={productionTimeMinutes}
                onChange={(e) => setProductionTimeMinutes(e.target.value)}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              />
            </div>
          </div>

          <div className="rounded-[8px] border border-[#E4E7EC] bg-[#EFF6FF] p-4 text-sm text-[#1D4ED8]">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <span className="block text-xs font-medium uppercase tracking-wide text-[#7C8DB5]">Saldo no tanque</span>
                <span className="mt-1 block font-semibold">{formatNumber(saldoLitros, 2)} L</span>
              </div>
              <div>
                <span className="block text-xs font-medium uppercase tracking-wide text-[#7C8DB5]">Total em unidades</span>
                <span className="mt-1 block font-semibold">{totalUnidades}</span>
              </div>
              <div>
                <span className="block text-xs font-medium uppercase tracking-wide text-[#7C8DB5]">Litros consumidos</span>
                <span className="mt-1 block font-semibold">{formatNumber(totalLitros, 2)} L</span>
              </div>
              <div>
                <span className="block text-xs font-medium uppercase tracking-wide text-[#7C8DB5]">Saldo restante</span>
                <span className={`mt-1 block font-semibold ${litrosRestantes < 0 ? 'text-[#B42318]' : 'text-[#1D4ED8]'}`}>
                  {formatNumber(litrosRestantes, 2)} L
                </span>
              </div>
            </div>
            {origemSelecionada && origemSelecionada.planning_status !== 'COMPLETED' && (
              <div className="mt-3 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Essa ordem de envase pode ser criada agora, mas só poderá ser iniciada quando a ordem do tanque estiver concluída.
              </div>
            )}
            {preview.startAt && preview.endAt && (
              <div className="mt-3">
                Início planejado: <span className="font-semibold">{format(preview.startAt, 'dd/MM/yyyy HH:mm')}</span> |
                {' '}Fim previsto: <span className="font-semibold">{format(preview.endAt, 'dd/MM/yyyy HH:mm')}</span>
              </div>
            )}
          </div>

          {conversionError && (
            <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {conversionError}
            </div>
          )}

          <div className="rounded-[8px] border border-[#E4E7EC] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#111827]">Agenda da máquina no dia</h3>
                <p className="mt-1 text-sm text-[#667085]">
                  Veja o que já está reservado para a máquina selecionada em {format(new Date(`${dataProducao}T00:00:00`), 'dd/MM/yyyy')}.
                </p>
              </div>
              {carregandoAgenda && (
                <span className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Carregando...</span>
              )}
            </div>

            {!maquinaId ? (
              <p className="mt-4 text-sm text-[#667085]">Selecione uma máquina para visualizar os horários ocupados.</p>
            ) : ordensDaMaquinaNoDia.length === 0 ? (
              <p className="mt-4 text-sm text-[#16A34A]">Nenhuma ordem de envase agendada para esta máquina nesta data.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {ordensDaMaquinaNoDia.map((ordem) => (
                  <div
                    key={ordem.id}
                    className="flex flex-col gap-1 rounded-[8px] border border-[#E4E7EC] bg-[#F7F8FA] px-3 py-2 text-sm text-[#111827] md:flex-row md:items-center md:justify-between"
                  >
                    <div className="font-medium">
                      {ordem.numero_externo} {ordem.produto?.nome ? `· ${ordem.produto.nome}` : ''}
                    </div>
                    <div className="text-[#4B5563]">
                      {ordem.inicio_agendado ? format(new Date(ordem.inicio_agendado), 'HH:mm') : '--:--'}
                      {' '}até{' '}
                      {ordem.fim_calculado ? format(new Date(ordem.fim_calculado), 'HH:mm') : '--:--'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hasPreviewConflict && conflictingOrder && (
              <div className="mt-4 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Conflito detectado com a ordem <span className="font-semibold">{conflictingOrder.numero_externo}</span>
                {' '}entre{' '}
                <span className="font-semibold">
                  {conflictingOrder.inicio_agendado ? format(new Date(conflictingOrder.inicio_agendado), 'HH:mm') : '--:--'}
                </span>
                {' '}e{' '}
                <span className="font-semibold">
                  {conflictingOrder.fim_calculado ? format(new Date(conflictingOrder.fim_calculado), 'HH:mm') : '--:--'}
                </span>
                .
              </div>
            )}
          </div>

          {erro && <p className="text-sm font-medium text-[#DC2626]">{erro}</p>}
          {sucesso && <p className="text-sm font-medium text-[#16A34A]">{sucesso}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setErro('')
                setSucesso('')
                resetForm()
              }}
              className="rounded-[8px] border border-[#CDD2DA] bg-white px-4 py-2 text-sm font-medium text-[#4B5563] hover:bg-[#F7F8FA]"
            >
              Limpar
            </button>
            <button
              type="submit"
              disabled={salvando || Boolean(conversionError) || hasPreviewConflict}
              className="rounded-[8px] bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar envase'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
