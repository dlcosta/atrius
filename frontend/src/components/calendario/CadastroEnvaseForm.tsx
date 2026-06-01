'use client'
import { apiUrl } from '@/lib/api'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle, AlertCircle, FlaskConical, RefreshCw, Info, ClipboardList, Plus } from 'lucide-react'
import type { Maquina, Produto } from '@/types'
import { ListaOrdens } from './ListaOrdens'
import {
  calculateEstimatedBoxes,
  calculateLitersFromBoxes,
  calculateTankVolumeBalance,
  calculateTotalDuration,
  VOLUME_BALANCE_TOLERANCE_LITERS,
} from '@/lib/planning/production'

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

type Props = {
  produtos: Produto[]
  onSalvo?: () => void
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        checked ? 'bg-[#2563EB]' : 'bg-[#D1D5DB]'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition-transform ${
          checked ? 'translate-x-7' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function Campo({
  label,
  obrigatorio,
  dica,
  children,
}: {
  label: string
  obrigatorio?: boolean
  dica?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-2 block text-[15px] font-semibold text-[#111827]">
        {label}{' '}
        {obrigatorio ? (
          <span className="text-red-500">*</span>
        ) : (
          <span className="text-[13px] font-normal text-[#9CA3AF]">(opcional)</span>
        )}
      </label>
      {dica && <p className="mb-2 text-[13px] text-[#6B7280]">{dica}</p>}
      {children}
    </div>
  )
}

function formatarLitros(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

const inputClass =
  'w-full rounded-xl border-2 border-[#E4E7EC] bg-white px-4 py-3 text-[15px] text-[#111827] transition-colors focus:border-[#2563EB] focus:outline-none'

export function CadastroEnvaseForm({ produtos, onSalvo }: Props) {
  const [modo, setModo] = useState<'form' | 'lista'>('form')
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [origensTanque, setOrigensTanque] = useState<TankOriginOption[]>([])
  const [originTankOrderId, setOriginTankOrderId] = useState('')
  const [machineId, setMachineId] = useState('')
  const [liters, setLiters] = useState('')
  const [packageVolumeLiters, setPackageVolumeLiters] = useState('5')
  const [unitsPerBox, setUnitsPerBox] = useState('4')
  const [setupTimeMinutes, setSetupTimeMinutes] = useState('10')
  const [productionTimeMinutes, setProductionTimeMinutes] = useState('60')
  const [cleaningTimeMinutes, setCleaningTimeMinutes] = useState('20')
  const [notes, setNotes] = useState('')
  const [dataProducao, setDataProducao] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [usarHoraInicio, setUsarHoraInicio] = useState(false)
  const [horaInicio, setHoraInicio] = useState('07:30')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      try {
        const [m, o] = await Promise.all([
          fetch(apiUrl('/api/maquinas')).then((r) => r.json()),
          fetch(apiUrl('/api/ordens/tanques-origem')).then((r) => r.json()),
        ])
        setMaquinas(Array.isArray(m) ? m.filter((item: Maquina) => item.ativa) : [])
        setOrigensTanque(Array.isArray(o) ? o : [])
      } catch {
        // continua funcional sem dados
      } finally {
        setCarregando(false)
      }
    }
    carregar()
  }, [])

  const originSelecionada = useMemo(
    () => origensTanque.find((item) => item.id === originTankOrderId) ?? null,
    [origensTanque, originTankOrderId],
  )

  // Ao selecionar origem, preenche litros com o saldo disponível
  useEffect(() => {
    if (originSelecionada) {
      setLiters(String(Math.max(0, originSelecionada.saldo_litros)))
    }
  }, [originSelecionada])

  const litersNum = Number(liters || 0)
  const packageVolumeNum = Number(packageVolumeLiters || 0)
  const unitsPerBoxNum = Number(unitsPerBox || 0)
  const boxVolumeLiters = packageVolumeNum * unitsPerBoxNum

  const { estimatedBoxes } = useMemo(
    () =>
      calculateEstimatedBoxes({
        liters: litersNum,
        packageVolumeLiters: packageVolumeNum,
        unitsPerBox: unitsPerBoxNum,
      }),
    [litersNum, packageVolumeNum, unitsPerBoxNum],
  )

  const totalDuration = useMemo(
    () =>
      calculateTotalDuration({
        setupTimeMinutes: Number(setupTimeMinutes || 0),
        productionTimeMinutes: Number(productionTimeMinutes || 0),
        cleaningTimeMinutes: Number(cleaningTimeMinutes || 0),
      }),
    [setupTimeMinutes, productionTimeMinutes, cleaningTimeMinutes],
  )

  const balancePreview = useMemo(() => {
    if (!originSelecionada) return null
    return calculateTankVolumeBalance({
      tankLiters: originSelecionada.litros_tanque,
      alreadyFilledLiters: originSelecionada.litros_envasados,
      currentFillingLiters: litersNum,
      tolerance: VOLUME_BALANCE_TOLERANCE_LITERS,
    })
  }, [originSelecionada, litersNum])

  function onChangeLiters(value: string) {
    setLiters(value)
  }

  function onChangePackaging(nextPackage: string, nextUnits: string) {
    setPackageVolumeLiters(nextPackage)
    setUnitsPerBox(nextUnits)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    const startAtIso = usarHoraInicio
      ? new Date(`${dataProducao}T${horaInicio}:00`).toISOString()
      : null

    try {
      const produtoSku = originSelecionada?.produto_sku ?? ''
      const lote = originSelecionada?.lote ?? null

      const res = await fetch(apiUrl('/api/ordens'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_sku: produtoSku,
          etapa: 'envase',
          calc_mode: 'LITERS_MASTER',
          liters: litersNum,
          estimated_boxes: estimatedBoxes,
          unidade: 'L',
          lote,
          tanque: null,
          tank_id: null,
          maquina_id: machineId || null,
          origin_tank_order_id: originTankOrderId || null,
          setup_time_minutes: Number(setupTimeMinutes),
          production_time_minutes: Number(productionTimeMinutes),
          cleaning_time_minutes: Number(cleaningTimeMinutes),
          package_volume_liters: packageVolumeNum || null,
          units_per_box: unitsPerBoxNum || 1,
          inicio_agendado: startAtIso,
          data_prevista: dataProducao,
          planning_status: startAtIso ? 'SCHEDULED' : 'BACKLOG',
          color: produtos.find((p) => p.sku === produtoSku)?.cor || '#16A34A',
          notes: notes || null,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(data.error ?? 'Erro ao criar ordem. Tente novamente.')
      } else {
        setSucesso(true)
        onSalvo?.()
      }
    } catch {
      setErro('Erro de conexão. Verifique sua internet e tente novamente.')
    }

    setSalvando(false)
  }

  function resetar() {
    setSucesso(false)
    setOriginTankOrderId('')
    setMachineId('')
    setLiters('')
    setNotes('')
    setErro('')
    setUsarHoraInicio(false)
  }

  // Barra de navegação de modo (sempre visível)
  const NavModo = (
    <div className="border-b border-[#E4E7EC] bg-white px-6 py-3">
      <div className="mx-auto flex max-w-3xl gap-2">
        <button
          onClick={() => setModo('form')}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold transition-all ${
            modo === 'form'
              ? 'bg-[#16A34A] text-white'
              : 'border-2 border-[#E4E7EC] bg-white text-[#4B5563] hover:bg-[#F0F2F5]'
          }`}
        >
          <Plus size={17} />
          Nova Ordem
        </button>
        <button
          onClick={() => setModo('lista')}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold transition-all ${
            modo === 'lista'
              ? 'bg-[#16A34A] text-white'
              : 'border-2 border-[#E4E7EC] bg-white text-[#4B5563] hover:bg-[#F0F2F5]'
          }`}
        >
          <ClipboardList size={17} />
          Ver Ordens Cadastradas
        </button>
      </div>
    </div>
  )

  if (modo === 'lista') {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {NavModo}
        <div className="min-h-0 flex-1 overflow-hidden">
          <ListaOrdens etapa="envase" />
        </div>
      </div>
    )
  }

  if (sucesso) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {NavModo}
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-20">
          <div className="mb-6 rounded-full bg-green-100 p-6">
            <CheckCircle size={64} className="text-green-600" />
          </div>
          <h2 className="mb-3 text-2xl font-bold text-[#111827]">Ordem cadastrada com sucesso!</h2>
          <p className="mb-10 max-w-sm text-center text-[15px] text-[#6B7280]">
            A ordem de envase foi criada. Ela já aparece no backlog do calendário para ser agendada
            em uma máquina.
          </p>
          <div className="flex gap-3">
            <button
              onClick={resetar}
              className="flex items-center gap-3 rounded-xl bg-[#16A34A] px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-[#15803D]"
            >
              <RefreshCw size={20} />
              Cadastrar outro
            </button>
            <button
              onClick={() => { resetar(); setModo('lista') }}
              className="flex items-center gap-3 rounded-xl border-2 border-[#E4E7EC] px-8 py-4 text-base font-semibold text-[#4B5563] transition-colors hover:bg-[#F0F2F5]"
            >
              <ClipboardList size={20} />
              Ver todas as ordens
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {NavModo}
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        {/* Cabeçalho */}
        <div className="mb-8 flex items-center gap-4">
          <div className="rounded-2xl bg-[#F0FDF4] p-4">
            <FlaskConical size={32} className="text-[#16A34A]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#111827]">Nova Ordem de Envase</h2>
            <p className="mt-1 text-[15px] text-[#6B7280]">
              Preencha os dados para cadastrar o envase do produto
            </p>
          </div>
        </div>

        {erro && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle size={22} className="mt-0.5 shrink-0 text-red-500" />
            <p className="text-[15px] text-red-700">{erro}</p>
          </div>
        )}

        {carregando ? (
          <div className="py-10 text-center text-[15px] text-[#9CA3AF]">Carregando dados...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Origem — Tanque */}
            <Campo
              label="Tanque de origem"
              obrigatorio
              dica="Selecione o tanque que foi produzido e será envasado."
            >
              {origensTanque.length === 0 ? (
                <div className="flex items-start gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-4">
                  <Info size={20} className="mt-0.5 shrink-0 text-amber-600" />
                  <div className="text-[15px] text-amber-800">
                    <p className="font-semibold">Nenhum tanque disponível para envase.</p>
                    <p className="mt-1 text-[13px]">
                      Só aparecem aqui os tanques com saldo de produto disponível. Verifique se
                      há ordens de tanque concluídas ou em produção.
                    </p>
                  </div>
                </div>
              ) : (
                <select
                  value={originTankOrderId}
                  onChange={(e) => setOriginTankOrderId(e.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="">Selecione o tanque de origem...</option>
                  {origensTanque.map((origem) => (
                    <option key={origem.id} value={origem.id}>
                      {origem.numero_externo} · {origem.produto_sku ?? 'SEM SKU'}
                      {origem.lote ? ` · Lote ${origem.lote}` : ''} · Saldo:{' '}
                      {formatarLitros(origem.saldo_litros)} L
                    </option>
                  ))}
                </select>
              )}
            </Campo>

            {/* Informações do tanque selecionado */}
            {originSelecionada && (
              <div className="rounded-xl border border-[#E4E7EC] bg-[#F7F8FA] p-4">
                <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  Resumo do tanque selecionado
                </p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-[12px] text-[#9CA3AF]">Total produzido</p>
                    <p className="mt-1 text-[17px] font-bold text-[#111827]">
                      {formatarLitros(originSelecionada.litros_tanque)} L
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-3">
                    <p className="text-[12px] text-[#9CA3AF]">Já envasado</p>
                    <p className="mt-1 text-[17px] font-bold text-[#111827]">
                      {formatarLitros(originSelecionada.litros_envasados)} L
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#EFF6FF] p-3">
                    <p className="text-[12px] text-[#2563EB]">Saldo disponível</p>
                    <p className="mt-1 text-[17px] font-bold text-[#2563EB]">
                      {formatarLitros(originSelecionada.saldo_litros)} L
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Balanço de volume */}
            {balancePreview && (
              <div
                className={`rounded-xl border p-4 text-[14px] ${
                  balancePreview.status === 'OVER'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : balancePreview.status === 'UNDER'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}
              >
                <p className="font-semibold">
                  {balancePreview.status === 'OVER'
                    ? '⚠️ Atenção: volume informado excede o saldo do tanque'
                    : balancePreview.status === 'UNDER'
                      ? 'ℹ️ Ainda haverá saldo restante no tanque após este envase'
                      : '✅ Volume balanceado com o tanque'}
                </p>
                {Math.abs(balancePreview.deltaLiters) > VOLUME_BALANCE_TOLERANCE_LITERS && (
                  <p className="mt-1">{balancePreview.warning}</p>
                )}
              </div>
            )}

            {/* Máquina */}
            <Campo
              label="Máquina de envase"
              obrigatorio
              dica="Selecione qual máquina realizará o envase."
            >
              {maquinas.length === 0 ? (
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-4 text-[15px] text-amber-700">
                  Nenhuma máquina ativa disponível. Verifique o cadastro em{' '}
                  <strong>Administração</strong>.
                </div>
              ) : (
                <select
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="">Selecione a máquina...</option>
                  {maquinas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              )}
            </Campo>

            {/* Volume a envasar */}
            <Campo
              label="Volume a envasar (litros)"
              obrigatorio
              dica="Preenchido automaticamente com o saldo do tanque. Pode ser ajustado."
            >
              <div className="relative">
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  value={liters}
                  onChange={(e) => onChangeLiters(e.target.value)}
                  className={inputClass}
                  placeholder="Ex: 1000"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-medium text-[#9CA3AF]">
                  L
                </span>
              </div>
            </Campo>

            {/* Embalagem */}
            <div className="rounded-xl border border-[#E4E7EC] bg-[#F7F8FA] p-5">
              <h3 className="mb-1 text-[15px] font-semibold text-[#111827]">
                Dados da embalagem
              </h3>
              <p className="mb-4 text-[13px] text-[#6B7280]">
                Informe como o produto será embalado para calcular o número de caixas.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-[13px] font-medium text-[#4B5563]">
                    Volume por embalagem (L)
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.001"
                    value={packageVolumeLiters}
                    onChange={(e) => onChangePackaging(e.target.value, unitsPerBox)}
                    className="w-full rounded-xl border-2 border-[#E4E7EC] bg-white px-3 py-3 text-[15px] focus:border-[#2563EB] focus:outline-none"
                    placeholder="Ex: 5"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[13px] font-medium text-[#4B5563]">
                    Unidades por caixa
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={unitsPerBox}
                    onChange={(e) => onChangePackaging(packageVolumeLiters, e.target.value)}
                    className="w-full rounded-xl border-2 border-[#E4E7EC] bg-white px-3 py-3 text-[15px] focus:border-[#2563EB] focus:outline-none"
                    placeholder="Ex: 4"
                  />
                </div>
              </div>
              {boxVolumeLiters > 0 && litersNum > 0 && (
                <div className="mt-4 rounded-lg bg-[#EFF6FF] px-4 py-3 text-center">
                  <p className="text-[13px] text-[#4B5563]">
                    {packageVolumeNum} L × {unitsPerBoxNum} un = {formatarLitros(boxVolumeLiters)} L
                    por caixa
                  </p>
                  <p className="mt-1 text-[17px] font-bold text-[#2563EB]">
                    Estimativa: {estimatedBoxes} caixas
                  </p>
                </div>
              )}
            </div>

            {/* Data de produção */}
            <Campo label="Data de envase" obrigatorio>
              <input
                type="date"
                required
                value={dataProducao}
                onChange={(e) => setDataProducao(e.target.value)}
                className={inputClass}
              />
            </Campo>

            {/* Tempos */}
            <div className="rounded-xl border border-[#E4E7EC] bg-[#F7F8FA] p-5">
              <h3 className="mb-1 text-[15px] font-semibold text-[#111827]">
                Tempos de produção (minutos)
              </h3>
              <p className="mb-4 text-[13px] text-[#6B7280]">
                Informe quanto tempo cada etapa do processo leva.
              </p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  {
                    label: 'Preparação',
                    value: setupTimeMinutes,
                    onChange: setSetupTimeMinutes,
                    min: 0,
                  },
                  {
                    label: 'Envase',
                    value: productionTimeMinutes,
                    onChange: setProductionTimeMinutes,
                    min: 1,
                  },
                  {
                    label: 'Limpeza',
                    value: cleaningTimeMinutes,
                    onChange: setCleaningTimeMinutes,
                    min: 0,
                  },
                ].map(({ label, value, onChange, min }) => (
                  <div key={label}>
                    <label className="mb-2 block text-[13px] font-medium text-[#4B5563]">
                      {label}
                    </label>
                    <input
                      type="number"
                      min={min}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      className="w-full rounded-xl border-2 border-[#E4E7EC] bg-white px-3 py-3 text-[15px] text-[#111827] focus:border-[#2563EB] focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-[#EFF6FF] px-4 py-3 text-center text-[15px] font-semibold text-[#2563EB]">
                Tempo total estimado: {totalDuration} minutos
              </div>
            </div>

            {/* Observações */}
            <Campo label="Observações">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-xl border-2 border-[#E4E7EC] bg-white px-4 py-3 text-[15px] text-[#111827] transition-colors focus:border-[#2563EB] focus:outline-none"
                placeholder="Informações adicionais sobre este envase..."
              />
            </Campo>

            {/* Hora de início */}
            <div className="rounded-xl border border-[#E4E7EC] bg-[#F7F8FA] p-5">
              <div className="flex items-center gap-4">
                <Toggle checked={usarHoraInicio} onChange={setUsarHoraInicio} />
                <div>
                  <p className="text-[15px] font-semibold text-[#111827]">Definir hora de início</p>
                  <p className="mt-0.5 text-[13px] text-[#6B7280]">
                    {usarHoraInicio
                      ? 'O envase será agendado no horário que você definir abaixo.'
                      : 'O envase ficará no backlog aguardando ser agendado no calendário.'}
                  </p>
                </div>
              </div>
              {usarHoraInicio && (
                <div className="mt-4">
                  <label className="mb-2 block text-[13px] font-medium text-[#4B5563]">
                    Hora de início
                  </label>
                  <input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                    className="rounded-xl border-2 border-[#E4E7EC] bg-white px-4 py-3 text-[15px] text-[#111827] focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={salvando || origensTanque.length === 0}
              className="w-full rounded-xl bg-[#16A34A] py-4 text-[17px] font-semibold text-white transition-colors hover:bg-[#15803D] disabled:opacity-50"
            >
              {salvando ? 'Cadastrando...' : 'Cadastrar Ordem de Envase'}
            </button>
          </form>
        )}
      </div>
      </div>
    </div>
  )
}
