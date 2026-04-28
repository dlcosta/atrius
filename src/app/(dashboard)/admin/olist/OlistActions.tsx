'use client'

import { useState } from 'react'

export default function OlistActions({ connected }: { connected: boolean }) {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  async function sincronizarCategorias() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sincronizar/categorias', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setSyncResult(`Erro: ${json.error}`)
      } else {
        setSyncResult(`${json.importadas} categorias importadas (${json.categorias_raiz} raízes).`)
      }
    } catch {
      setSyncResult('Erro de rede.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {connected && (
        <>
          <button
            onClick={sincronizarCategorias}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar Categorias'}
          </button>
          {syncResult && (
            <p className="text-sm text-gray-700">{syncResult}</p>
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
