'use client'
import { apiUrl } from '@/lib/api'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { Maquina, Produto, ProdutoTanque, Tanque } from '@/types'
import { toast } from '@/lib/ui/toast'
import {
  CalcMode,
  calculateEstimatedBoxes,
  calculateLitersFromBoxes,
  calculateProductionEndTime,
  calculateTankVolumeBalance,
  calculateTotalDuration,
  VOLUME_BALANCE_TOLERANCE_LITERS,
} from '@/lib/planning/production'
import { validateScheduleStart } from '@/lib/planning/schedule'

type Props = {
  produtos: Produto[]
  dataInicial: Date
  onSalvo: () => void
  onFechar: () => void
}

type TankOriginOption = {
  id: string
  numero_externo: string
  produto_sku: string | null
  lote: string | null
  litros_tanque: number
  litros_envasados: number
  saldo_litros: number
  balance_status: 'BALANCED' | 'UNDER' | 'OVER'
  data_prevista: string | null
}

function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.00'
}

export function NovaOrdemForm({ produtos, dataInicial, onSalvo, onFechar }: Props) {
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [origensTanque, setOrigensTanque] = useState<TankOriginOption[]>([])
  const [produtosTanque, setProdutosTanque] = useState<ProdutoTanque[]>([])
  const [produtoSku, setProdutoSku] = useState('')
  const [produtoEnvaseSku, setProdutoEnvaseSku] = useState('')
  const [etapa, setEtapa] = useState<'tanque' | 'envase'>('tanque')
  const [calcMode, setCalcMode] = useState<CalcMode>('LITERS_MASTER')
  const [liters, setLiters] = useState('3800')
  const [estimatedBoxesInput, setEstimatedBoxesInput] = useState('190')
  const [setupTimeMinutes, setSetupTimeMinutes] = useState('10')
  const [productionTimeMinutes, setProductionTimeMinutes] = useState('60')
  const [lote, setLote] = useState('')
  const [notes, setNotes] = useState('')
  const [tankId, setTankId] = useState('')
  const [machineId, setMachineId] = useState('')
  const [originTankOrderId, setOriginTankOrderId] = useState('')
  const [packageVolumeLiters, setPackageVolumeLiters] = useState('5')
  const [unitsPerBox, setUnitsPerBox] = useState('4')
  const [cor, setCor] = useState('#5B9BD5')
  const [dataProducao, setDataProducao] = useState(format(dataInicial, 'yyyy-MM-dd'))
  const [usarHoraInicio, setUsarHoraInicio] = useState(false)
  const [horaInicio, setHoraInicio] = useState('07:30')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    async function carregarRecursos() {
      try {
        const [m, t, o, pt] = await Promise.all([
          fetch(apiUrl('/api/maquinas')).then((r) => r.json()),
          fetch(apiUrl('/api/tanques')).then((r) => r.json()),
          fetch(apiUrl('/api/ordens/tanques-origem')).then((r) => r.json()),
          fetch(apiUrl('/api/produtos-tanque')).then((r) => r.json()),
        ])
        setMaquinas(Array.isArray(m) ? m.filter((item) => item.ativa) : [])
        setTanques(Array.isArray(t) ? t.filter((item) => item.ativo) : [])
        setOrigensTanque(Array.isArray(o) ? o : [])
        setProdutosTanque(Array.isArray(pt) ? pt : [])
      } catch {
        // O formulário continua funcional mesmo sem carregar os recursos.
      }
    }
    carregarRecursos()
  }, [])

  const originSelecionada = useMemo(
    () => origensTanque.find((item) => item.id === originTankOrderId) ?? null,
    [origensTanque, originTankOrderId]
  )

  useEffect(() => {
    if (etapa === 'envase' && originSelecionada) {
      setLote(originSelecionada.lote ?? '')
      if (!liters || Number(liters) <= 0) {
        setLiters(String(Math.max(originSelecionada.saldo_litros, 0)))
      }
    }
    if (etapa === 'tanque') {
      setOriginTankOrderId('')
      setMachineId('')
      setCalcMode('LITERS_MASTER')
      setEstimatedBoxesInput('')
      setPackageVolumeLiters('')
      setUnitsPerBox('')
    }
  }, [etapa, originSelecionada]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalDurationMinutes = useMemo(() => {
    return calculateTotalDuration({
      setupTimeMinutes: Number(setupTimeMinutes || 0),
      productionTimeMinutes: Number(productionTimeMinutes || 0),
      cleaningTimeMinutes: 0,
    })
  }, [setupTimeMinutes, productionTimeMinutes])

  const boxVolumeLiters = useMemo(() => {
    return Number(packageVolumeLiters || 0) * Number(unitsPerBox || 0)
  }, [packageVolumeLiters, unitsPerBox])

  const litersNumber = Number(liters || 0)
  const estimatedBoxesCalculated = useMemo(() => {
    if (boxVolumeLiters <= 0) return 0
    return Math.floor(litersNumber / boxVolumeLiters)
  }, [litersNumber, boxVolumeLiters])

  const estimatedBoxesValue = calcMode === 'BOXES_MASTER'
    ? Number(estimatedBoxesInput || 0)
    : estimatedBoxesCalculated

  useEffect(() => {
    if (etapa !== 'envase') return
    if (calcMode === 'LITERS_MASTER') {
      setEstimatedBoxesInput(String(Math.max(0, estimatedBoxesCalculated)))
    }
  }, [calcMode, estimatedBoxesCalculated, etapa])

  function onChangeLiters(value: string) {
    setLiters(value)
    if (etapa === 'envase' && calcMode === 'LITERS_MASTER' && boxVolumeLiters > 0) {
      const nextBoxes = Math.floor(Number(value || 0) / boxVolumeLiters)
      setEstimatedBoxesInput(String(Math.max(0, nextBoxes)))
    }
  }

  function onChangeBoxes(value: string) {
    setEstimatedBoxesInput(value)
    if (etapa === 'envase' && calcMode === 'BOXES_MASTER') {
      const litersFromBoxes = calculateLitersFromBoxes({
        boxes: Number(value || 0),
        packageVolumeLiters: Number(packageVolumeLiters || 0),
        unitsPerBox: Number(unitsPerBox || 0),
      })
      setLiters(formatNumber(litersFromBoxes, 2))
    }
  }

  function onChangePackaging(nextPackage: string, nextUnits: string) {
    setPackageVolumeLiters(nextPackage)
    setUnitsPerBox(nextUnits)

    if (etapa !== 'envase') return

    if (calcMode === 'BOXES_MASTER') {
      const litersFromBoxes = calculateLitersFromBoxes({
        boxes: Number(estimatedBoxesInput || 0),
        packageVolumeLiters: Number(nextPackage || 0),
        unitsPerBox: Number(nextUnits || 0),
      })
      setLiters(formatNumber(litersFromBoxes, 2))
      return
    }

    const nextBoxVolume = Number(nextPackage || 0) * Number(nextUnits || 0)
    if (nextBoxVolume > 0) {
      const nextBoxes = Math.floor(Number(liters || 0) / nextBoxVolume)
      setEstimatedBoxesInput(String(Math.max(0, nextBoxes)))
    }
  }

  const preview = useMemo(() => {
    const startAt = usarHoraInicio ? new Date(`${dataProducao}T${horaInicio}:00`) : null
    const endAt = startAt && Number.isFinite(startAt.getTime())
      ? calculateProductionEndTime(startAt, totalDurationMinutes)
      : null
    const { boxVolumeLiters: previewBoxVolume, estimatedBoxes } = calculateEstimatedBoxes({
      liters: Number(liters || 0),
      packageVolumeLiters: Number(packageVolumeLiters || 0),
      unitsPerBox: Number(unitsPerBox || 0),
    })
    return {
      startAt,
      endAt,
      boxVolumeLiters: previewBoxVolume,
      estimatedBoxes,
    }
  }, [usarHoraInicio, dataProducao, horaInicio, totalDurationMinutes, liters, packageVolumeLiters, unitsPerBox])

  const balancePreview = useMemo(() => {
    if (etapa !== 'envase' || !originSelecionada) return null
    return calculateTankVolumeBalance({
      tankLiters: Number(originSelecionada.litros_tanque || 0),
      alreadyFilledLiters: Number(originSelecionada.litros_envasados || 0),
      currentFillingLiters: Number(liters || 0),
      tolerance: VOLUME_BALANCE_TOLERANCE_LITERS,
    })
  }, [etapa, originSelecionada, liters])

  const selectedProduct = useMemo(
    () =>
      etapa === 'tanque'
        ? (produtosTanque.find((item) => item.sku === produtoSku) ?? null)
        : (produtos.find((item) => item.sku === produtoEnvaseSku) ?? null),
    [etapa, produtosTanque, produtoSku, produtos, produtoEnvaseSku]
  )

  // Auto-fill de embalagem ao selecionar produto de envase
  useEffect(() => {
    if (etapa !== 'envase' || !produtoEnvaseSku) return
    const p = produtos.find((x) => x.sku === produtoEnvaseSku)
    if (!p) return
    if (p.package_volume_liters) setPackageVolumeLiters(String(p.package_volume_liters))
    if (p.units_per_box) setUnitsPerBox(String(p.units_per_box))
  }, [produtoEnvaseSku, etapa, produtos]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const startAt = usarHoraInicio ? new Date(`${dataProducao}T${horaInicio}:00`) : null
    const startAtError = startAt ? validateScheduleStart(startAt) : null
    if (startAtError) {
      toast.error(startAtError)
      return
    }

    setSalvando(true)

    const startAtIso = startAt?.toISOString() ?? null
    const selectedTank = tanques.find((item) => item.id === tankId)

    try {
      const payload = {
        produto_sku: etapa === 'tanque' ? produtoSku : produtoEnvaseSku,
        etapa,
        calc_mode: calcMode,
        liters: Number(liters),
        estimated_boxes: etapa === 'envase' ? Number(estimatedBoxesValue || 0) : null,
        unidade: 'L',
        lote: lote || null,
        tanque: selectedTank?.nome ?? null,
        tank_id: tankId || null,
        maquina_id: etapa === 'envase' ? machineId || null : null,
        origin_tank_order_id: etapa === 'envase' ? originTankOrderId || null : null,
        setup_time_minutes: Number(setupTimeMinutes),
        production_time_minutes: Number(productionTimeMinutes),
        cleaning_time_minutes: 0,
        package_volume_liters: etapa === 'envase' ? Number(packageVolumeLiters || 0) || null : null,
        units_per_box: etapa === 'envase' ? Number(unitsPerBox || 0) || 1 : 1,
        inicio_agendado: startAtIso,
        data_prevista: dataProducao,
        planning_status: startAtIso ? 'SCHEDULED' : 'BACKLOG',
        color: cor || selectedProduct?.cor || null,
        notes: notes || null,
      }

      const res = await fetch(apiUrl('/api/ordens'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao criar ordem')
      } else {
        onSalvo()
      }
    } catch {
      toast.error('Erro de rede')
    }

    setSalvando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-[12px] border border-[#E4E7EC] bg-white p-6 shadow-[var(--shadow-md)]">
        <h2 className="text-xl font-semibold text-[#111827]">Nova produção manual</h2>
        <p className="mb-6 text-sm text-[#9CA3AF]">Fluxo separado para tanque e envase com controle de volume operacional.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Tipo de produção</label>
              <select
                value={etapa}
                onChange={(e) => setEtapa(e.target.value as 'tanque' | 'envase')}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              >
                <option value="tanque">Tanque</option>
                <option value="envase">Envase</option>
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

          {etapa === 'envase' && (
            <div className="rounded-[8px] border border-[#E4E7EC] bg-[#F7F8FA] p-3">
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Origem (ordem de tanque)</label>
              <select
                value={originTankOrderId}
                onChange={(e) => setOriginTankOrderId(e.target.value)}
                required
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
              >
                <option value="">Selecione a ordem de tanque...</option>
                {origensTanque.map((origem) => (
                  <option key={origem.id} value={origem.id}>
                    {origem.numero_externo} · {origem.produto_sku ?? 'SEM SKU'} · lote {origem.lote ?? '--'} · saldo {formatNumber(origem.saldo_litros, 2)}L
                  </option>
                ))}
              </select>
              {origensTanque.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">Não há ordens de tanque com saldo disponível para envase.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">
                {etapa === 'tanque' ? 'Fórmula (tanque)' : 'Produto de envase'}
              </label>
              {etapa === 'tanque' ? (
                <select
                  value={produtoSku}
                  onChange={(e) => setProdutoSku(e.target.value)}
                  required
                  className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
                >
                  <option value="">Selecione...</option>
                  {produtosTanque.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={produtoEnvaseSku}
                  onChange={(e) => setProdutoEnvaseSku(e.target.value)}
                  required
                  className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
                >
                  <option value="">Selecione...</option>
                  {produtos.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Lote</label>
              <input
                type="text"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                disabled={etapa === 'envase'}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827] disabled:bg-[#F0F2F5]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">{etapa === 'tanque' ? 'Tanque' : 'Máquina'}</label>
              {etapa === 'tanque' ? (
                <select
                  value={tankId}
                  onChange={(e) => setTankId(e.target.value)}
                  required
                  className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
                >
                  <option value="">Selecione...</option>
                  {tanques.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                  required
                  className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
                >
                  <option value="">Selecione...</option>
                  {maquinas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Litros</label>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={liters}
                onChange={(e) => onChangeLiters(e.target.value)}
                disabled={etapa === 'envase' && calcMode === 'BOXES_MASTER'}
                className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827] disabled:bg-[#F0F2F5]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Preparação (min)</label>
              <input type="number" min={0} required value={setupTimeMinutes} onChange={(e) => setSetupTimeMinutes(e.target.value)} className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Produção (min)</label>
              <input type="number" min={1} required value={productionTimeMinutes} onChange={(e) => setProductionTimeMinutes(e.target.value)} className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]" />
            </div>
          </div>

          {etapa === 'envase' && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#4B5563]">Modo de cálculo</label>
                  <select
                    value={calcMode}
                    onChange={(e) => setCalcMode(e.target.value as CalcMode)}
                    className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
                  >
                    <option value="LITERS_MASTER">Litros mestre</option>
                    <option value="BOXES_MASTER">Caixas mestre</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#4B5563]">Quantidade de caixas</label>
                  <input
                    type="number"
                    min={0}
                    value={estimatedBoxesInput}
                    onChange={(e) => onChangeBoxes(e.target.value)}
                    disabled={calcMode === 'LITERS_MASTER'}
                    className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827] disabled:bg-[#F0F2F5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#4B5563]">Volume embalagem (L)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={packageVolumeLiters}
                    onChange={(e) => onChangePackaging(e.target.value, unitsPerBox)}
                    className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#4B5563]">Unidades por caixa</label>
                  <input
                    type="number"
                    min={1}
                    value={unitsPerBox}
                    onChange={(e) => onChangePackaging(packageVolumeLiters, e.target.value)}
                    className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#4B5563]">Volume por caixa</label>
                  <input
                    type="text"
                    value={`${formatNumber(boxVolumeLiters, 2)} L`}
                    readOnly
                    className="w-full rounded-[8px] border border-[#E4E7EC] bg-[#F0F2F5] px-3 py-2 text-sm text-[#4B5563]"
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Cor do card</label>
              <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-10 w-full rounded-[8px] border border-[#E4E7EC] bg-white px-2" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#4B5563]">Observações</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827]" />
            </div>
          </div>

          <div className="rounded-[8px] border border-[#E4E7EC] bg-[#F7F8FA] p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-[#4B5563]">
              <input type="checkbox" checked={usarHoraInicio} onChange={(e) => setUsarHoraInicio(e.target.checked)} />
              Informar hora de início no cadastro (se desmarcado, fica para agendar)
            </label>
            {usarHoraInicio && (
              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium text-[#4B5563]">Hora de início</label>
                <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-full rounded-[8px] border border-[#E4E7EC] bg-white px-3 py-2 text-sm text-[#111827] md:w-48" />
              </div>
            )}
          </div>

          <div className="rounded-[8px] border border-[#E4E7EC] bg-[#EFF6FF] p-3 text-sm text-[#1D4ED8]">
            <div>Tempo total: <span className="font-semibold">{totalDurationMinutes} min</span></div>
            {preview.startAt && preview.endAt && (
              <div>
                Início planejado: <span className="font-semibold">{format(preview.startAt, 'dd/MM/yyyy HH:mm')}</span> | Fim previsto: <span className="font-semibold">{format(preview.endAt, 'dd/MM/yyyy HH:mm')}</span>
              </div>
            )}
            {etapa === 'envase' ? (
              <div>
                Estimativa: <span className="font-semibold">{estimatedBoxesValue}</span> caixas de {unitsPerBox || '0'} unidades de {packageVolumeLiters || '0'}L
              </div>
            ) : (
              <div>Produção em tanque: <span className="font-semibold">{formatNumber(Number(liters || 0), 2)} L</span></div>
            )}
          </div>

          {etapa === 'envase' && balancePreview && (
            <div className={`rounded-[8px] border p-3 text-sm ${
              balancePreview.status === 'OVER'
                ? 'border-red-200 bg-red-50 text-red-800'
                : balancePreview.status === 'UNDER'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}>
              <div className="font-semibold">
                {balancePreview.status === 'OVER' ? 'Atenção: volume excedente no envase' : balancePreview.status === 'UNDER' ? 'Atenção: ainda faltará volume para envase total' : 'Volume balanceado com o tanque'}
              </div>
              <div className="mt-1">
                Tanque: {formatNumber(originSelecionada?.litros_tanque ?? 0, 2)} L | Envasado atual: {formatNumber(originSelecionada?.litros_envasados ?? 0, 2)} L | Com esta ordem: {formatNumber(balancePreview.totalFilledLiters, 2)} L
              </div>
              {Math.abs(balancePreview.deltaLiters) > VOLUME_BALANCE_TOLERANCE_LITERS && (
                <div className="mt-1 font-medium">{balancePreview.warning}</div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onFechar} className="rounded-[8px] border border-[#CDD2DA] bg-white px-4 py-2 text-sm font-medium text-[#4B5563] hover:bg-[#F7F8FA]">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="rounded-[8px] bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50">
              {salvando ? 'Salvando...' : 'Salvar produção'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
