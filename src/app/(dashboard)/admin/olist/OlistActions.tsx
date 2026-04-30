'use client'

import { useState } from 'react'

type SyncState = { loading: boolean; result: string | null }

const idle: SyncState = { loading: false, result: null }

export default function OlistActions({ connected }: { connected: boolean }) {
  const [categorias, setCategorias] = useState<SyncState>(idle)
  const [produtos, setProdutos] = useState<SyncState>(idle)
  const [pedidos, setPedidos] = useState<SyncState>(idle)
  const [itensPedidos, setItensPedidos] = useState<SyncState>(idle)

  async function sincronizarCategorias() {
    setCategorias({ loading: true, result: null })
    try {
      const res = await fetch('/api/sincronizar/categorias', { method: 'POST' })
      const json = await res.json()
      setCategorias({
        loading: false,
        result: res.ok
          ? `${json.importadas} categorias importadas (${json.categorias_raiz} raizes).`
          : `Erro: ${json.error}`,
      })
    } catch {
      setCategorias({ loading: false, result: 'Erro de rede.' })
    }
  }

  async function sincronizarProdutos() {
    setProdutos({ loading: true, result: null })
    try {
      const res = await fetch('/api/sincronizar/produtos', { method: 'POST' })
      const json = await res.json()
      setProdutos({
        loading: false,
        result: res.ok
          ? `${json.importados} de ${json.total} produtos importados${json.erros > 0 ? ` (${json.erros} erros)` : ''}.`
          : `Erro: ${json.error}`,
      })
    } catch {
      setProdutos({ loading: false, result: 'Erro de rede.' })
    }
  }

  async function sincronizarPedidos() {
    setPedidos({ loading: true, result: null })
    try {
      const res = await fetch('/api/sincronizar/pedidos', { method: 'POST' })
      const json = await res.json()
      setPedidos({
        loading: false,
        result: res.ok
          ? `${json.importados} de ${json.total_api ?? json.total ?? 0} pedidos importados (${json.mode ?? 'backfill'})${json.erros > 0 ? ` (${json.erros} erros)` : ''}.`
          : `Erro: ${json.error}`,
      })
    } catch {
      setPedidos({ loading: false, result: 'Erro de rede.' })
    }
  }

  async function sincronizarItensPedidos() {
    setItensPedidos({ loading: true, result: null })
    try {
      const res = await fetch('/api/sincronizar/pedidos/itens', { method: 'POST' })
      const json = await res.json()
      setItensPedidos({
        loading: false,
        result: res.ok
          ? `${json.itens_importados} itens importados em ${json.pedidos_processados} pedidos (${json.modo}).`
          : `Erro: ${json.error}`,
      })
    } catch {
      setItensPedidos({ loading: false, result: 'Erro de rede.' })
    }
  }

  const busy = categorias.loading || produtos.loading || pedidos.loading || itensPedidos.loading

  return (
    <div className="flex flex-col gap-3">
      {connected && (
        <>
          <button
            onClick={sincronizarCategorias}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {categorias.loading ? 'Sincronizando...' : 'Sincronizar Categorias'}
          </button>
          {categorias.result && (
            <p className="text-sm text-gray-700">{categorias.result}</p>
          )}

          <button
            onClick={sincronizarProdutos}
            disabled={busy}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {produtos.loading ? 'Sincronizando produtos...' : 'Sincronizar Produtos'}
          </button>
          {produtos.result && (
            <p className="text-sm text-gray-700">{produtos.result}</p>
          )}

          <button
            onClick={sincronizarPedidos}
            disabled={busy}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {pedidos.loading ? 'Sincronizando pedidos...' : 'Sincronizar Pedidos'}
          </button>
          {pedidos.result && (
            <p className="text-sm text-gray-700">{pedidos.result}</p>
          )}

          <button
            onClick={sincronizarItensPedidos}
            disabled={busy}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          >
            {itensPedidos.loading ? 'Sincronizando itens...' : 'Sincronizar Itens de Pedidos'}
          </button>
          {itensPedidos.result && (
            <p className="text-sm text-gray-700">{itensPedidos.result}</p>
          )}
        </>
      )}

      <a
        href="/api/olist/oauth/login"
        className="px-4 py-2 bg-gray-800 text-white rounded text-center hover:bg-gray-700"
      >
        {connected ? 'Reconectar com Olist ERP' : 'Conectar com Olist ERP'}
      </a>
    </div>
  )
}
