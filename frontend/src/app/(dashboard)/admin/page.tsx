'use client'
import { apiUrl } from '@/lib/api'

import { useEffect, useState, useCallback } from 'react'
import { Boxes, Clock, Cog, Package2, Sparkles, Users2, Waypoints, Waves } from 'lucide-react'
import type { Produto, Maquina, Operador, Tanque, Turno } from '@/types'
import { ProdutoList } from '@/components/admin/ProdutoList'
import { MaquinaList } from '@/components/admin/MaquinaList'
import { OperadorList } from '@/components/admin/OperadorList'
import { TanqueList } from '@/components/admin/TanqueList'
import { TurnoList } from '@/components/admin/TurnoList'

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  hint: string
  icon: typeof Boxes
  tone: 'blue' | 'amber' | 'emerald' | 'cyan'
}) {
  const toneMap = {
    blue: 'border-blue-200 bg-blue-50 text-blue-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-950',
  }

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-semibold leading-none">{value}</div>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/80 p-2 text-slate-700 shadow-sm">
          <Icon size={18} />
        </div>
      </div>
      <div className="mt-3 text-sm text-slate-600">{hint}</div>
    </div>
  )
}

export default function AdminPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErroCarga(null)

    try {
      const [pRes, mRes, tRes, oRes, turRes] = await Promise.all([
        fetch(apiUrl('/api/produtos')),
        fetch(apiUrl('/api/maquinas')),
        fetch(apiUrl('/api/tanques')),
        fetch(apiUrl('/api/operadores')),
        fetch(apiUrl('/api/turnos')),
      ])

      const [p, m, t, o, tur] = await Promise.all([pRes.json(), mRes.json(), tRes.json(), oRes.json(), turRes.json()])

      if (!pRes.ok) throw new Error(p?.error ?? 'Erro ao carregar produtos')
      if (!mRes.ok) throw new Error(m?.error ?? 'Erro ao carregar máquinas')
      if (!tRes.ok) throw new Error(t?.error ?? 'Erro ao carregar tanques')
      if (!oRes.ok) throw new Error(o?.error ?? 'Erro ao carregar operadores')
      if (!turRes.ok) throw new Error(tur?.error ?? 'Erro ao carregar turnos')

      setProdutos(Array.isArray(p) ? p : [])
      setMaquinas(Array.isArray(m) ? m : [])
      setTanques(Array.isArray(t) ? t : [])
      setOperadores(Array.isArray(o) ? o : [])
      setTurnos(Array.isArray(tur) ? tur : [])
    } catch (error) {
      setErroCarga(error instanceof Error ? error.message : 'Erro ao carregar cadastros')
      setProdutos([])
      setMaquinas([])
      setTanques([])
      setOperadores([])
      setTurnos([])
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const maquinasAtivas = maquinas.filter((maquina) => maquina.ativa).length
  const tanquesAtivos = tanques.filter((tanque) => tanque.ativo).length
  const operadoresAtivos = operadores.filter((operador) => operador.ativo).length
  const turnosAtivos = turnos.filter((t) => t.ativo).length

  return (
    <div className="flex h-full flex-col overflow-auto bg-[#F7F8FA]">
      <main className="mx-auto w-full max-w-7xl space-y-8 px-6 py-8">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_42%,#eff6ff_100%)] shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
          <div className="grid gap-0 lg:grid-cols-[1.25fr_0.9fr]">
            <div className="p-7 lg:p-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm backdrop-blur">
                <Sparkles size={13} />
                Base cadastral manual
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                Cadastros diretos pela aplicação, sem depender de integrações externas.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Esta área agora fica focada só na manutenção manual da base operacional. Cadastre,
                edite, inative ou exclua os registros diretamente por aqui.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  1. Máquinas
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  2. Tanques
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  3. Operadores
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  4. Turnos
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  5. Produtos
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200/70 bg-white/70 p-6 backdrop-blur lg:border-l lg:border-t-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Sequência recomendada
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="font-semibold text-slate-900">Cadastre máquinas e tanques primeiro</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Assim o restante da operação já encontra todos os recursos disponíveis.
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="font-semibold text-slate-900">Depois monte a equipe</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Os operadores alimentam a rastreabilidade e os indicadores do painel.
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="font-semibold text-slate-900">Produtos por último</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Assim a base de recursos e equipe já está pronta antes do cadastro dos SKUs.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {erroCarga && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {erroCarga}
          </section>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Máquinas"
            value={maquinas.length}
            hint={`${maquinasAtivas} ativas para planejamento e operação`}
            icon={Cog}
            tone="blue"
          />
          <SummaryCard
            label="Tanques"
            value={tanques.length}
            hint={`${tanquesAtivos} ativos para preparo e origem de envase`}
            icon={Waves}
            tone="cyan"
          />
          <SummaryCard
            label="Operadores"
            value={operadores.length}
            hint={`${operadoresAtivos} ativos para execução da produção`}
            icon={Users2}
            tone="amber"
          />
          <SummaryCard
            label="Turnos"
            value={turnos.length}
            hint={`${turnosAtivos} ativos no calendário e painel operacional`}
            icon={Clock}
            tone="emerald"
          />
          <SummaryCard
            label="Produtos"
            value={produtos.length}
            hint="Base local de SKUs, nomes e cores"
            icon={Package2}
            tone="blue"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Etapa 1
                </div>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Recursos de envase</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Cadastre e mantenha as máquinas diretamente pela aplicação.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
                <Waypoints size={18} />
              </div>
            </div>
            <MaquinaList maquinas={maquinas} onAtualizado={carregar} />
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Etapa 2
                </div>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Recursos de tanques</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Cadastre os tanques para liberar ordens de preparo e vínculos de envase.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
                <Waves size={18} />
              </div>
            </div>
            <TanqueList tanques={tanques} onAtualizado={carregar} />
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Etapa 3
              </div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Equipe operacional</h2>
              <p className="mt-1 text-sm text-slate-500">
                Cadastro manual de operadores, com edição, ativação e exclusão.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
              <Users2 size={18} />
            </div>
          </div>
          <OperadorList operadores={operadores} onAtualizado={carregar} />
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Etapa 4
              </div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Turnos de produção</h2>
              <p className="mt-1 text-sm text-slate-500">
                Configure os turnos que definem a grade horária do calendário e do painel operacional.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
              <Clock size={18} />
            </div>
          </div>
          <TurnoList turnos={turnos} onAtualizado={carregar} />
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Etapa 5
              </div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Biblioteca de produtos</h2>
              <p className="mt-1 text-sm text-slate-500">
                Mantenha SKU, nome e cor dos produtos direto no cadastro interno.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
              <Boxes size={18} />
            </div>
          </div>

          {(maquinas.length === 0 || tanques.length === 0) && (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Cadastre pelo menos uma máquina e um tanque antes de montar produtos. A base operacional depende desses recursos.
            </div>
          )}

          <ProdutoList produtos={produtos} onAtualizado={carregar} />
        </section>
      </main>
    </div>
  )
}
