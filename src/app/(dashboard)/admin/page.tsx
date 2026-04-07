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
    <div className="flex flex-col h-full overflow-hidden">
      <main className="max-w-6xl mx-auto w-full px-6 py-8 space-y-8">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-all">
          <ProdutoList produtos={produtos} maquinas={maquinas} onAtualizado={carregar} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-all">
          <MaquinaList maquinas={maquinas} onAtualizado={carregar} />
        </section>
      </main>
    </div>
  )
}
