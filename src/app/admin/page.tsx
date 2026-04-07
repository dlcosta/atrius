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
    setProdutos(p)
    setMaquinas(m)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-4">
        <h1 className="text-xl font-bold text-gray-900">Atrius Planner — Admin</h1>
      </header>
      <main className="max-w-5xl mx-auto px-8 py-8 space-y-12">
        <ProdutoList produtos={produtos} onAtualizado={carregar} />
        <MaquinaList maquinas={maquinas} onAtualizado={carregar} />
      </main>
    </div>
  )
}
