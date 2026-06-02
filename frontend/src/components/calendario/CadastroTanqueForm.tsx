'use client'
import { apiUrl } from '@/lib/api'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle, Droplets, RefreshCw, ClipboardList, Plus } from 'lucide-react'
import type { Produto, Tanque } from '@/types'
import { calculateTotalDuration } from '@/lib/planning/production'
import { validateScheduleStart } from '@/lib/planning/schedule'
import { toast } from '@/lib/ui/toast'
import { ListaOrdens } from './ListaOrdens'

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

const inputClass =
  'w-full rounded-xl border-2 border-[#E4E7EC] bg-white px-4 py-3 text-[15px] text-[#111827] transition-colors focus:border-[#2563EB] focus:outline-none'

export function CadastroTanqueForm({ produtos, onSalvo }: Props) {
  const [modo, setModo] = useState<'form' | 'lista'>('form')
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [produtoSku, setProdutoSku] = useState('')
  const [tankId, setTankId] = useState('')
  const [liters, setLiters] = useState('3800')
  const [setupTimeMinutes, setSetupTimeMinutes] = useState('10')
  const [productionTimeMinutes, setProductionTimeMinutes] = useState('60')
  const [lote, setLote] = useState('')
  const [notes, setNotes] = useState('')
  const [dataProducao, setDataProducao] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [usarHoraInicio, setUsarHoraInicio] = useState(false)
  const [horaInicio, setHoraInicio] = useState('07:30')
  const [sucesso, setSucesso] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    fetch(apiUrl('/api/tanques'))
      .then((r) => r.json())
      .then((data) => setTanques(Array.isArray(data) ? data.filter((t: Tanque) => t.ativo) : []))
      .catch(() => {})
  }, [])

  const totalDuration = useMemo(
    () =>
      calculateTotalDuration({
        setupTimeMinutes: Number(setupTimeMinutes || 0),
        productionTimeMinutes: Number(productionTimeMinutes || 0),
        cleaningTimeMinutes: 0,
      }),
    [setupTimeMinutes, productionTimeMinutes],
  )

  const selectedProduct = produtos.find((p) => p.sku === produtoSku) ?? null
  const selectedTank = tanques.find((t) => t.id === tankId) ?? null

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

    try {
      const res = await fetch(apiUrl('/api/ordens'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          setup_time_minutes: Number(setupTimeMinutes),
          production_time_minutes: Number(productionTimeMinutes),
          cleaning_time_minutes: 0,
          package_volume_liters: null,
          units_per_box: 1,
          inicio_agendado: startAtIso,
          data_prevista: dataProducao,
          planning_status: startAtIso ? 'SCHEDULED' : 'BACKLOG',
          color: selectedProduct?.cor || '#5B9BD5',
          notes: notes || null,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao criar ordem. Tente novamente.')
      } else {
        setSucesso(true)
        onSalvo?.()
      }
    } catch {
      toast.error('Erro de conexão. Verifique sua internet e tente novamente.')
    }

    setSalvando(false)
  }

  function resetar() {
    setSucesso(false)
    setProdutoSku('')
    setTankId('')
    setLiters('3800')
    setLote('')
    setNotes('')
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
              ? 'bg-[#2563EB] text-white'
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
              ? 'bg-[#2563EB] text-white'
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
          <ListaOrdens etapa="tanque" />
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
            A ordem de produção do tanque foi criada e já aparece em Para agendar no calendário.
          </p>
          <div className="flex gap-3">
            <button
              onClick={resetar}
              className="flex items-center gap-3 rounded-xl bg-[#2563EB] px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
            >
              <RefreshCw size={20} />
              Cadastrar outra
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
          <div className="rounded-2xl bg-[#EFF6FF] p-4">
            <Droplets size={32} className="text-[#2563EB]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#111827]">Nova Ordem de Tanque</h2>
            <p className="mt-1 text-[15px] text-[#6B7280]">Preencha os dados para cadastrar a produção</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Produto */}
          <Campo label="Produto" obrigatorio>
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
          </Campo>

          {/* Tanque */}
          <Campo label="Tanque" obrigatorio dica="Selecione qual tanque será utilizado nesta produção.">
            {tanques.length === 0 ? (
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-4 text-[15px] text-amber-700">
                Nenhum tanque ativo disponível. Verifique o cadastro em{' '}
                <strong>Administração</strong>.
              </div>
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
                    {t.volume_liters ? ` — ${t.volume_liters.toLocaleString('pt-BR')} L` : ''}
                  </option>
                ))}
              </select>
            )}
          </Campo>

          {/* Volume */}
          <Campo
            label="Volume em litros"
            obrigatorio
            dica="Quantidade total de produto que será produzida neste tanque."
          >
            <div className="relative">
              <input
                type="number"
                min={1}
                step="0.01"
                required
                value={liters}
                onChange={(e) => setLiters(e.target.value)}
                className={inputClass}
                placeholder="Ex: 3800"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-medium text-[#9CA3AF]">
                L
              </span>
            </div>
          </Campo>

          {/* Data de produção */}
          <Campo label="Data de produção" obrigatorio>
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
              Tempos (minutos)
            </h3>
            <p className="mb-4 text-[13px] text-[#6B7280]">
              A preparação já inclui ajustes, setup e limpeza. Depois informe apenas o tempo de produção.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  label: 'Preparação',
                  value: setupTimeMinutes,
                  onChange: setSetupTimeMinutes,
                  min: 0,
                },
                {
                  label: 'Produção',
                  value: productionTimeMinutes,
                  onChange: setProductionTimeMinutes,
                  min: 1,
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

          {/* Lote */}
          <Campo label="Número do lote">
            <input
              type="text"
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              className={inputClass}
              placeholder="Ex: LOTE-2024-001"
            />
          </Campo>

          {/* Observações */}
          <Campo label="Observações">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border-2 border-[#E4E7EC] bg-white px-4 py-3 text-[15px] text-[#111827] transition-colors focus:border-[#2563EB] focus:outline-none"
              placeholder="Informações adicionais sobre esta produção..."
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
                    ? 'A ordem será agendada no horário que você definir abaixo.'
                    : 'A ordem ficará em "Para agendar" aguardando horário no calendário.'}
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
            disabled={salvando}
            className="w-full rounded-xl bg-[#2563EB] py-4 text-[17px] font-semibold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {salvando ? 'Cadastrando...' : 'Cadastrar Ordem de Tanque'}
          </button>
        </form>
      </div>
      </div>
    </div>
  )
}
