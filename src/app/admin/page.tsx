'use client'
import { useEffect, useState, useCallback } from 'react'
import type { Produto, Maquina } from '@/types'
import { ProdutoList } from '@/components/admin/ProdutoList'
import { MaquinaList } from '@/components/admin/MaquinaList'

export default function AdminPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [maquinas, setMaquinas] = useState<Maquina[]>([])

  const carregar = useCallback(async () => {
    const [p, m] = await Promise.all([
      fetch('/api/produtos').then((r) => r.json()),
      fetch('/api/maquinas').then((r) => r.json()),
    ])

    setProdutos(Array.isArray(p) ? p : [])
    setMaquinas(Array.isArray(m) ? m : [])
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Atrius Planner - Admin</h1>
            <p className="text-sm text-slate-500">Cadastro de produtos, tempos por maquina e estrutura da linha.</p>
          </div>
          <a
            href="/planner"
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
          >
            Voltar ao planner
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <ProdutoList produtos={produtos} maquinas={maquinas} onAtualizado={carregar} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <MaquinaList maquinas={maquinas} onAtualizado={carregar} />
        </section>
      </main>
    </div>
  )
}
