'use client'
import { apiUrl } from '@/lib/api'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { Ordem, ProdutoTanque, Tanque } from '@/types'
import { toast } from '@/lib/ui/toast'
import {
  calculateProductionEndTime,
  calculateTotalDuration,
  hasScheduleConflict,
} from '@/lib/planning/production'
import { validateScheduleStart } from '@/lib/planning/schedule'

type Props = {
  produtosTanque: ProdutoTanque[]
}

function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.00'
}

export function OrdemProducaoTanquePage({ produtosTanque }: Props) {
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [ordensDoDia, setOrdensDoDia] = useState<Ordem[]>([])
  const [carregandoAgenda, setCarregandoAgenda] = useState(false)
  const [numeroExterno, setNumeroExterno] = useState('')
  const [produtoSku, setProdutoSku] = useState('')
  const [liters, setLiters] = useState('3800')
  const [setupCleaningTimeMinutes, setSetupCleaningTimeMinutes] = useState('10')
  const [productionTimeMinutes, setProductionTimeMinutes] = useState('60')
  const [lote, setLote] = useState('')
  const [notes, setNotes] = useState('')
  const [tankId, setTankId] = useState('')
  const [cor, setCor] = useState('#5B9BD5')
  const [dataProducao, setDataProducao] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [horaInicio, setHoraInicio] = useState('07:30')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    async function carregarTanques() {
      try {
        const response = await fetch(apiUrl('/api/tanques'))
        const data = await response.json()
        setTanques(Array.isArray(data) ? data.filter((item) => item.ativo) : [])
      } catch {
        setTanques([])
      }
    }

    carregarTanques()
  }, [])

  useEffect(() => {
    async function carregarAgendaDoDia() {
      setCarregandoAgenda(true)
      try {
        const response = await fetch(apiUrl(`/api/novo-fluxo/tanques?inicio=${dataProducao}&fim=${dataProducao}`))
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

  const selectedProduct = useMemo(
    () => produtosTanque.find((item) => item.sku === produtoSku) ?? null,
    [produtos, produtoSku]
  )

  const selectedTank = useMemo(
    () => tanques.find((item) => item.id === tankId) ?? null,
    [tanques, tankId]
  )

  const totalDurationMinutes = useMemo(() => {
    return calculateTotalDuration({
      setupTimeMinutes: Number(setupCleaningTimeMinutes || 0),
      productionTimeMinutes: Number(productionTimeMinutes || 0),
      cleaningTimeMinutes: 0,
    })
  }, [setupCleaningTimeMinutes, productionTimeMinutes])

  const preview = useMemo(() => {
    const startAt = new Date(`${dataProducao}T${horaInicio}:00`)
    const endAt =
      startAt && Number.isFinite(startAt.getTime())
        ? calculateProductionEndTime(startAt, totalDurationMinutes)
        : null

    return { startAt, endAt }
  }, [dataProducao, horaInicio, totalDurationMinutes])

  const ordensDoTanqueNoDia = useMemo(() => {
    return ordensDoDia
      .filter((ordem) => ordem.etapa === 'tanque')
      .filter((ordem) => ordem.tank_id === tankId)
      .filter((ordem) => ordem.inicio_agendado && ordem.fim_calculado)
      .sort((a, b) => {
        const aMs = a.inicio_agendado ? new Date(a.inicio_agendado).getTime() : 0
        const bMs = b.inicio_agendado ? new Date(b.inicio_agendado).getTime() : 0
        return aMs - bMs
      })
  }, [ordensDoDia, tankId])

  const hasPreviewConflict = useMemo(() => {
    if (!tankId || !preview.startAt || !preview.endAt) return false

    return hasScheduleConflict({
      productionType: 'TANK',
      tankId,
      newStart: preview.startAt,
      newEnd: preview.endAt,
      existingSchedules: ordensDoTanqueNoDia,
    })
  }, [tankId, preview.startAt, preview.endAt, ordensDoTanqueNoDia])

  const conflictingOrder = useMemo(() => {
    if (!preview.startAt || !preview.endAt) return null
    const previewEndAt = preview.endAt

    return (
      ordensDoTanqueNoDia.find((ordem) => {
        if (!ordem.inicio_agendado || !ordem.fim_calculado) return false
        const inicioExistente = new Date(ordem.inicio_agendado)
        const fimExistente = new Date(ordem.fim_calculado)
        return preview.startAt < fimExistente && previewEndAt > inicioExistente
      }) ?? null
    )
  }, [preview.startAt, preview.endAt, ordensDoTanqueNoDia])

  function resetForm() {
    setNumeroExterno('')
    setProdutoSku('')
    setLiters('3800')
    setSetupCleaningTimeMinutes('10')
    setProductionTimeMinutes('60')
    setLote('')
    setNotes('')
    setTankId('')
    setCor('#5B9BD5')
    setDataProducao(format(new Date(), 'yyyy-MM-dd'))
    setHoraInicio('07:30')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (hasPreviewConflict) {
      toast.error('Esse tanque já possui uma ordem agendada nesse intervalo.')
      return
    }

    const startAt = new Date(`${dataProducao}T${horaInicio}:00`)
    const startAtError = validateScheduleStart(startAt)
    if (startAtError) {
      toast.error(startAtError)
      return
    }

    setSalvando(true)
    const startAtIso = startAt.toISOString()

    try {
      const payload = {
        numero_externo: numeroExterno.trim(),
        produto_sku: produtoSku,
        etapa: 'tanque',
        calc_mode: 'LITERS_MASTER',
        liters: Number(liters),
        estimated_boxes: null,
        unidade: 'L',
        lote: lote || null,
        tanque: selectedTank?.nome ?? null,
        tank_id: tankId || null,
        maquina_id: null,
        origin_tank_order_id: null,
        setup_time_minutes: Number(setupCleaningTimeMinutes),
        production_time_minutes: Number(productionTimeMinutes),
        cleaning_time_minutes: 0,
        package_volume_liters: null,
        units_per_box: 1,
        inicio_agendado: startAtIso,
        data_prevista: dataProducao,
        planning_status: 'SCHEDULED',
        color: cor || selectedProduct?.cor || null,
        notes: notes || null,
      }

      const res = await fetch(apiUrl('/api/novo-fluxo/tanques'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao criar ordem')
        return
      }

      toast.success(`Ordem de tanque criada com sucesso${data?.numero_externo ? `: ${data.numero_externo}` : '.'}`)
      setOrdensDoDia((atual) => {
        if (!data || typeof data !== 'object') return atual
        return [...atual, data as Ordem]
      })
      resetForm()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-[12px] border border-[#E4E7EC] bg-white p-6 shadow-[var(--shadow-sm)]">
        <div className="max-w-3xl">
          <span className="inline-flex rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#2563EB]">
            Novo fluxo
          </span>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight text-[#111827]">
            Ordem de Produção - Tanques
          </h1>
          <p className="mt-2 text-sm text-[#667085]">
            Esta página replica os campos do cadastro manual para produção em tanque, separando o fluxo
            novo antes de removermos o que ficar antigo.
          </p>
        </div>
      </section>

      <section className="rounded-[12px] border border-[#E4E7EC] bg-white p-6 shadow-[var(--shadow-sm)]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Tipo de produção</label>
              <select
                value="tanque"
                disabled
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-[#F0F2F5] px-3 py-2 text-sm text-[#111827]"
              >
                <option value="tanque">Tanque</option>
              </select>
            </div>
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
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">ID da ordem</label>
              <input
                type="text"
                required
                value={numeroExterno}
                onChange={(e) => setNumeroExterno(e.target.value)}
                placeholder="Ex.: OP-TQ-001"
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Produto</label>
              <select
                value={produtoSku}
                onChange={(e) => setProdutoSku(e.target.value)}
                required
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              >
                <option value="">Selecione...</option>
                {produtosTanque.map((produto) => (
                  <option key={produto.sku} value={produto.sku}>
                    {produto.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Lote</label>
              <input
                type="text"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Tanque</label>
              <select
                value={tankId}
                onChange={(e) => setTankId(e.target.value)}
                required
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              >
                <option value="">Selecione...</option>
                {tanques.map((tanque) => (
                  <option key={tanque.id} value={tanque.id}>
                    {tanque.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Litros</label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={liters}
                onChange={(e) => setLiters(e.target.value)}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Etapa de Preparação (min)</label>
              <input
                type="number"
                min={0}
                required
                value={setupCleaningTimeMinutes}
                onChange={(e) => setSetupCleaningTimeMinutes(e.target.value)}
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

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Cor do card</label>
              <input
                type="color"
                value={cor}
                onChange={(e) => setCor(e.target.value)}
                className="h-10 w-full rounded-[8px] border border-[#E4E7EC] bg-white px-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Observações</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              />
            </div>
          </div>

          <div className="rounded-[8px] border border-[#E4E7EC] bg-[#F7F8FA] p-3">
            <p className="text-sm font-medium text-[#4B5563]">
              Horário de início obrigatório para incluir a ordem diretamente no calendário.
            </p>
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Hora de início</label>
              <input
                type="time"
                required
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827] md:w-48"
              />
            </div>
          </div>

          <div className="rounded-[8px] border border-[#E4E7EC] bg-[#EFF6FF] p-3 text-sm text-[#1D4ED8]">
            <div>
              Tempo total: <span className="font-semibold">{totalDurationMinutes} min</span>
            </div>
            {preview.startAt && preview.endAt && (
              <div>
                Início planejado: <span className="font-semibold">{format(preview.startAt, 'dd/MM/yyyy HH:mm')}</span> |
                {' '}Fim previsto: <span className="font-semibold">{format(preview.endAt, 'dd/MM/yyyy HH:mm')}</span>
              </div>
            )}
            <div>
              Produção em tanque:{' '}
              <span className="font-semibold">{formatNumber(Number(liters || 0), 2)} L</span>
            </div>
            {selectedTank && (
              <div>
                Tanque selecionado: <span className="font-semibold">{selectedTank.nome}</span>
              </div>
            )}
          </div>

          <div className="rounded-[8px] border border-[#E4E7EC] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#111827]">Agenda do tanque no dia</h3>
                <p className="mt-1 text-sm text-[#667085]">
                  Veja o que já está reservado para o tanque selecionado em {format(new Date(`${dataProducao}T00:00:00`), 'dd/MM/yyyy')}.
                </p>
              </div>
              {carregandoAgenda && (
                <span className="text-xs font-medium uppercase tracking-wide text-[#9CA3AF]">Carregando...</span>
              )}
            </div>

            {!tankId ? (
              <p className="mt-4 text-sm text-[#667085]">Selecione um tanque para visualizar os horários ocupados.</p>
            ) : ordensDoTanqueNoDia.length === 0 ? (
              <p className="mt-4 text-sm text-[#16A34A]">Nenhuma ordem agendada para este tanque nesta data.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {ordensDoTanqueNoDia.map((ordem) => (
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

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm()
              }}
              className="rounded-[8px] border border-[#CDD2DA] bg-white px-4 py-2 text-sm font-medium text-[#4B5563] hover:bg-[#F7F8FA]"
            >
              Limpar
            </button>
            <button
              type="submit"
              disabled={salvando || hasPreviewConflict}
              className="rounded-[8px] bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar produção'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
