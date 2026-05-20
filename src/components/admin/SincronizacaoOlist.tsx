'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Zap } from 'lucide-react'

type ConnectionStatus = {
  connected: boolean
  expiresAt?: string
  obtainedAt?: string
}

type SyncResult = {
  tipo: 'pedidos' | 'itens' | 'produtos' | 'categorias'
  carregando: boolean
  sucesso?: boolean
  erro?: string
  dados?: Record<string, unknown>
}

export function SincronizacaoOlist() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false })
  const [resultados, setResultados] = useState<SyncResult[]>([])
  const [carregandoGlobal, setCarregandoGlobal] = useState(false)

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/olist/oauth/status')
      const data = await res.json()
      setStatus(data)
    } catch (err) {
      console.error('Erro ao verificar status:', err)
    }
  }

  const sincronizar = async (tipo: 'pedidos' | 'itens' | 'produtos' | 'categorias', full = false) => {
    setResultados((prev) => {
      const existing = prev.findIndex((r) => r.tipo === tipo)
      const novo: SyncResult = { tipo, carregando: true }
      if (existing >= 0) {
        prev[existing] = novo
        return [...prev]
      }
      return [...prev, novo]
    })

    try {
      const refreshRes = await fetch('/api/olist/refresh-token', { method: 'POST' })
      if (!refreshRes.ok) {
        const refreshData = await refreshRes.json()
        throw new Error(`Falha ao renovar token: ${refreshData.error}`)
      }

      let url = ''
      switch (tipo) {
        case 'pedidos':
          url = `/api/sincronizar/pedidos${full ? '?mode=full' : ''}`
          break
        case 'itens':
          url = `/api/sincronizar/pedidos/itens${full ? '?full=1' : ''}`
          break
        case 'produtos':
          url = `/api/sincronizar/produtos${full ? '?full=1' : ''}`
          break
        case 'categorias':
          url = '/api/sincronizar/categorias'
          break
      }

      const res = await fetch(url, { method: 'POST' })
      const data = await res.json()

      setResultados((prev) => {
        const idx = prev.findIndex((r) => r.tipo === tipo)
        prev[idx] = {
          tipo,
          carregando: false,
          sucesso: res.ok,
          erro: res.ok ? undefined : data.error,
          dados: res.ok ? data : undefined,
        }
        return [...prev]
      })
    } catch (error) {
      setResultados((prev) => {
        const idx = prev.findIndex((r) => r.tipo === tipo)
        prev[idx] = {
          tipo,
          carregando: false,
          sucesso: false,
          erro: String(error),
        }
        return [...prev]
      })
    }
  }

  const sincronizarTudo = async (full = false) => {
    setCarregandoGlobal(true)
    await sincronizar('produtos', full)
    await sincronizar('pedidos', full)
    await sincronizar('itens', full)
    setCarregandoGlobal(false)
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: status.connected ? '#f0fdf4' : '#fef2f2',
          borderColor: status.connected ? '#86efac' : '#fecaca',
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: status.connected ? '#15803d' : '#991b1b' }}>
              {status.connected ? '✓ Olist ERP conectado' : '✕ Olist ERP desconectado'}
            </h3>
            {status.connected && status.expiresAt && (
              <div className="mt-2 space-y-1 text-sm" style={{ color: '#166534' }}>
                <p>Token válido até: {new Date(status.expiresAt).toLocaleString('pt-BR')}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <a
              href="/api/olist/oauth/login"
              className="whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: status.connected ? '#64748b' : '#dc2626' }}
            >
              {status.connected ? 'Reconectar' : 'Conectar'}
            </a>
            <button
              onClick={checkStatus}
              className="whitespace-nowrap rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Recarregar
            </button>
          </div>
        </div>
      </div>

      {status.connected && (
        <div>
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Sincronizar com Olist</h3>

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            <button
              onClick={() => sincronizarTudo(false)}
              disabled={carregandoGlobal}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} />
              Tudo (incremental)
            </button>

            <button
              onClick={() => sincronizarTudo(true)}
              disabled={carregandoGlobal}
              className="flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Zap size={16} />
              Tudo (full)
            </button>

            <button
              onClick={() => sincronizar('categorias')}
              disabled
              title="Token não tem permissão para acessar categorias"
              className="flex cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-gray-400 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              <RefreshCw size={16} />
              Categorias (indisponível)
            </button>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-2">
            <button
              onClick={() => sincronizar('produtos')}
              disabled={carregandoGlobal}
              className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} />
              Produtos
            </button>

            <button
              onClick={() => sincronizar('pedidos')}
              disabled={carregandoGlobal}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} />
              Pedidos
            </button>

            <button
              onClick={() => sincronizar('itens')}
              disabled={carregandoGlobal}
              className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} />
              Itens de pedidos
            </button>
          </div>

          {resultados.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">Resultados</h4>
              <div className="space-y-2">
                {resultados.map((resultado) => {
                  const titulo = {
                    pedidos: 'Pedidos',
                    itens: 'Itens de pedidos',
                    produtos: 'Produtos',
                    categorias: 'Categorias',
                  }[resultado.tipo]

                  return (
                    <div
                      key={resultado.tipo}
                      className={`rounded-lg border p-3 ${
                        resultado.carregando
                          ? 'border-blue-200 bg-blue-50'
                          : resultado.sucesso
                            ? 'border-green-200 bg-green-50'
                            : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{titulo}</div>
                          {resultado.carregando && (
                            <div className="mt-1 text-xs text-slate-600">Sincronizando...</div>
                          )}
                          {resultado.sucesso && resultado.dados && (
                            <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                              {Object.entries(resultado.dados).map(([key, value]) => (
                                <div key={key}>
                                  <span className="font-medium">{key}:</span> {String(value)}
                                </div>
                              ))}
                            </div>
                          )}
                          {resultado.erro && (
                            <div className="mt-1 text-xs text-red-700">{resultado.erro}</div>
                          )}
                        </div>
                        {resultado.carregando && (
                          <RefreshCw className="flex-shrink-0 animate-spin text-blue-600" size={16} />
                        )}
                        {resultado.sucesso && (
                          <div className="flex-shrink-0 text-green-600">✓</div>
                        )}
                        {resultado.erro && (
                          <div className="flex-shrink-0 text-red-600">✕</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!status.connected && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-sm text-gray-700">Conecte-se com o Olist ERP para acessar as opções de sincronização.</p>
        </div>
      )}
    </div>
  )
}
