'use client'
import { apiUrl } from '@/lib/api'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  CheckCircle,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react'
import type { Maquina, Produto, Tanque } from '@/types'
import {
  calculateEstimatedBoxes,
  calculateTotalDuration,
} from '@/lib/planning/production'

type TankOriginOption = {
  id: string
  numero_externo: string
  produto_sku: string | null
  lote: string | null
  litros_tanque: number
  litros_envasados: number
  saldo_litros: number
  data_prevista: string | null
}

type Props = {
  etapa: 'tanque' | 'envase'
  produtos: Produto[]
  onSalvo: () => void
  onFechar: () => void
}

const labelClass = 'mb-1.5 block text-[13px] font-semibold text-[#374151]'
const inputClass =
  'w-full rounded-[10px] border-2 border-[#E4E7EC] bg-white px-3 py-2.5 text-[14px] text-[#111827] transition-colors focus:border-[#2563EB] focus:outline-none'

export function CadastroRapidoForm({ etapa, produtos, onSalvo, onFechar }: Props) {
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [origensTanque, setOrigensTanque] = useState<TankOriginOption[]>([])

  const [produtoSku, setProdutoSku] = useState('')
  const [tankId, setTankId] = useState('')
  const [originTankOrderId, setOriginTankOrderId] = useState('')
  const [machineId, setMachineId] = useState('')
  const [liters, setLiters] = useState('3800')
  const [lote, setLote] = useState('')
  const [dataProducao, setDataProducao] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [packageVolumeLiters, setPackageVolumeLiters] = useState('5')
  const [unitsPerBox, setUnitsPerBox] = useState('4')
  const [setupTimeMinutes, setSetupTimeMinutes] = useState('10')
  const [productionTimeMinutes, setProductionTimeMinutes] = useState('60')
  const [cleaningTimeMinutes, setCleaningTimeMinutes] = useState('20')

  const [mostrarAvancado, setMostrarAvancado] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      try {
        if (etapa === 'tanque') {
          const t = await fetch(apiUrl('/api/tanques')).then((r) => r.json())
          setTanques(Array.isArray(t) ? t.filter((x: Tanque) => x.ativo) : [])
        } else {
          const [m, o] = await Promise.all([
            fetch(apiUrl('/api/maquinas')).then((r) => r.json()),
            fetch(apiUrl('/api/ordens/tanques-origem')).then((r) => r.json()),
          ])
          setMaquinas(Array.isArray(m) ? m.filter((x: Maquina) => x.ativa) : [])
          setOrigensTanque(Array.isArray(o) ? o : [])
        }
      } catch {
        // continua funcional
      } finally {
        setCarregando(false)
      }
    }
    carregar()
  }, [etapa])

  const originSelecionada = origensTanque.find((o) => o.id === originTankOrderId) ?? null

  useEffect(() => {
    if (etapa === 'envase' && originSelecionada) {
      setProdutoSku(originSelecionada.produto_sku ?? '')
      setLote(originSelecionada.lote ?? '')
      setLiters(String(Math.max(0, originSelecionada.saldo_litros)))
    }
  }, [originSelecionada]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTank = tanques.find((t) => t.id === tankId) ?? null
  const selectedProduct = produtos.find((p) => p.sku === produtoSku) ?? null

  const litersNum = Number(liters || 0)
  const packageVolumeNum = Number(packageVolumeLiters || 0)
  const unitsPerBoxNum = Number(unitsPerBox || 0)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)

    try {
      const payload =
        etapa === 'tanque'
          ? {
              produto_sku: produtoSku,
              etapa: 'tanque',
              calc_mode: 'LITERS_MASTER',
              liters: litersNum,
              estimated_boxes: null,
              unidade: 'L',
              lote: lote || null,
              tanque: selectedTank?.nome ?? null,
              tank_id: tankId || null,
              maquina_id: null,
              origin_tank_order_id: null,
              setup_time_minutes: Number(setupTimeMinutes),
              production_time_minutes: Number(productionTimeMinutes),
              cleaning_time_minutes: Number(cleaningTimeMinutes),
              package_volume_liters: null,
              units_per_box: 1,
              inicio_agendado: null,
              data_prevista: dataProducao,
              planning_status: 'BACKLOG',
              color: selectedProduct?.cor || '#5B9BD5',
              notes: null,
            }
          : {
              produto_sku: produtoSku,
              etapa: 'envase',
              calc_mode: 'LITERS_MASTER',
              liters: litersNum,
              estimated_boxes: estimatedBoxes,
              unidade: 'L',
              lote: lote || null,
              tanque: null,
              tank_id: null,
              maquina_id: machineId || null,
              origin_tank_order_id: originTankOrderId || null,
              setup_time_minutes: Number(setupTimeMinutes),
              production_time_minutes: Number(productionTimeMinutes),
              cleaning_time_minutes: Number(cleaningTimeMinutes),
              package_volume_liters: packageVolumeNum || null,
              units_per_box: unitsPerBoxNum || 1,
              inicio_agendado: null,
              data_prevista: dataProducao,
              planning_status: 'BACKLOG',
              color: selectedProduct?.cor || '#16A34A',
              notes: null,
            }

      const res = await fetch(apiUrl('/api/ordens'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(data.error ?? 'Erro ao criar ordem. Tente novamente.')
      } else {
        setSucesso(true)
        setTimeout(() => {
          setSucesso(false)
          onSalvo()
        }, 2000)
      }
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    }

    setSalvando(false)
  }

  if (sucesso) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12">
        <div className="rounded-full bg-green-100 p-4">
          <CheckCircle size={40} className="text-green-600" />
        </div>
        <p className="text-[15px] font-semibold text-[#111827]">Ordem cadastrada!</p>
        <p className="text-center text-[13px] text-[#6B7280]">
          Ela aparecerá no backlog em instantes.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header do formulário */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#E4E7EC] bg-white px-3 py-2.5">
        <button
          type="button"
          onClick={onFechar}
          className="grid h-8 w-8 place-items-center rounded-lg text-[#4B5563] hover:bg-[#F0F2F5]"
          title="Voltar"
        >
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-[14px] font-semibold text-[#111827]">
          Nova Ordem de {etapa === 'tanque' ? 'Tanque' : 'Envase'}
        </h3>
      </div>

      {/* Corpo do formulário */}
      <div className="flex-1 overflow-y-auto p-4">
        {carregando ? (
          <p className="py-8 text-center text-[13px] text-[#9CA3AF]">Carregando...</p>
        ) : (
          <>
            {erro && (
              <div className="mb-4 flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
                <p className="text-[13px] text-red-700">{erro}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* ── TANQUE ── */}
              {etapa === 'tanque' && (
                <>
                  <div>
                    <label className={labelClass}>
                      Produto <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={produtoSku}
                      onChange={(e) => setProdutoSku(e.target.value)}
                      required
                      className={inputClass}
                    >
                      <option value="">Selecione o produto...</option>
                      {produtos.map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>
                      Tanque <span className="text-red-500">*</span>
                    </label>
                    {tanques.length === 0 ? (
                      <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-700">
                        Nenhum tanque ativo. Verifique a Administração.
                      </p>
                    ) : (
                      <select
                        value={tankId}
                        onChange={(e) => setTankId(e.target.value)}
                        required
                        className={inputClass}
                      >
                        <option value="">Selecione o tanque...</option>
                        {tanques.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                            {t.volume_liters ? ` (${t.volume_liters.toLocaleString('pt-BR')} L)` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              )}

              {/* ── ENVASE ── */}
              {etapa === 'envase' && (
                <>
                  <div>
                    <label className={labelClass}>
                      Tanque de origem <span className="text-red-500">*</span>
                    </label>
                    {origensTanque.length === 0 ? (
                      <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-700">
                        Nenhum tanque com saldo disponível.
                      </p>
                    ) : (
                      <select
                        value={originTankOrderId}
                        onChange={(e) => setOriginTankOrderId(e.target.value)}
                        required
                        className={inputClass}
                      >
                        <option value="">Selecione o tanque...</option>
                        {origensTanque.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.produto_sku ?? 'SEM SKU'} · {o.saldo_litros.toFixed(0)} L disponível
                          </option>
                        ))}
                      </select>
                    )}

                    {originSelecionada && (
                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
                        <div className="rounded-[8px] bg-[#F7F8FA] py-1.5">
                          <p className="text-[#9CA3AF]">Total</p>
                          <p className="font-bold text-[#111827]">
                            {originSelecionada.litros_tanque.toFixed(0)} L
                          </p>
                        </div>
                        <div className="rounded-[8px] bg-[#F7F8FA] py-1.5">
                          <p className="text-[#9CA3AF]">Envasado</p>
                          <p className="font-bold text-[#111827]">
                            {originSelecionada.litros_envasados.toFixed(0)} L
                          </p>
                        </div>
                        <div className="rounded-[8px] bg-[#EFF6FF] py-1.5">
                          <p className="text-[#2563EB]">Saldo</p>
                          <p className="font-bold text-[#2563EB]">
                            {originSelecionada.saldo_litros.toFixed(0)} L
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>
                      Máquina <span className="text-red-500">*</span>
                    </label>
                    {maquinas.length === 0 ? (
                      <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-700">
                        Nenhuma máquina ativa. Verifique a Administração.
                      </p>
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
                  </div>
                </>
              )}

              {/* ── CAMPOS COMUNS ── */}
              <div>
                <label className={labelClass}>
                  Volume (litros) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  className={inputClass}
                  placeholder="Ex: 3800"
                />
              </div>

              <div>
                <label className={labelClass}>
                  Data de produção <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={dataProducao}
                  onChange={(e) => setDataProducao(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Lote</label>
                <input
                  type="text"
                  value={lote}
                  onChange={(e) => setLote(e.target.value)}
                  className={inputClass}
                  placeholder="LOTE-001 (opcional)"
                />
              </div>

              {/* Opções avançadas */}
              <button
                type="button"
                onClick={() => setMostrarAvancado((v) => !v)}
                className="flex w-full items-center justify-between rounded-[10px] border border-[#E4E7EC] bg-[#F7F8FA] px-3 py-2.5 text-[13px] font-medium text-[#4B5563] hover:bg-[#F0F2F5]"
              >
                <span>Tempos e embalagem</span>
                {mostrarAvancado ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {mostrarAvancado && (
                <div className="space-y-4 rounded-[12px] border border-[#E4E7EC] bg-[#F7F8FA] p-3">
                  {etapa === 'envase' && (
                    <div>
                      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                        Embalagem
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[12px] text-[#4B5563]">
                            Vol. emb. (L)
                          </label>
                          <input
                            type="number"
                            min={0.01}
                            step="0.001"
                            value={packageVolumeLiters}
                            onChange={(e) => setPackageVolumeLiters(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[12px] text-[#4B5563]">
                            Un. por caixa
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={unitsPerBox}
                            onChange={(e) => setUnitsPerBox(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      {estimatedBoxes > 0 && (
                        <p className="mt-2 text-center text-[12px] font-semibold text-[#2563EB]">
                          ≈ {estimatedBoxes} caixas
                        </p>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                      Tempos (minutos)
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Prep.', value: setupTimeMinutes, set: setSetupTimeMinutes },
                        {
                          label: etapa === 'envase' ? 'Envase' : 'Prod.',
                          value: productionTimeMinutes,
                          set: setProductionTimeMinutes,
                        },
                        { label: 'Limp.', value: cleaningTimeMinutes, set: setCleaningTimeMinutes },
                      ].map(({ label, value, set }) => (
                        <div key={label}>
                          <label className="mb-1 block text-[12px] text-[#4B5563]">{label}</label>
                          <input
                            type="number"
                            min={0}
                            value={value}
                            onChange={(e) => set(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-center text-[12px] font-medium text-[#2563EB]">
                      Total: {totalDuration} min
                    </p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={salvando}
                className={`w-full rounded-[10px] py-3 text-[15px] font-semibold text-white transition-colors disabled:opacity-50 ${
                  etapa === 'tanque'
                    ? 'bg-[#2563EB] hover:bg-[#1D4ED8]'
                    : 'bg-[#16A34A] hover:bg-[#15803D]'
                }`}
              >
                {salvando
                  ? 'Cadastrando...'
                  : `Cadastrar ${etapa === 'tanque' ? 'Tanque' : 'Envase'}`}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
