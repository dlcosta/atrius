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

  const sincronizar = async (tipo: 'pedidos' | 'itens' | 'produtos' | 'categorias', full: boolean = false) => {
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
      // Renovar token antes de sincronizar
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
          url = `/api/sincronizar/categorias`
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

  const sincronizarTudo = async (full: boolean = false) => {
    setCarregandoGlobal(true)
    await sincronizar('produtos', full)
    await sincronizar('pedidos', full)
    await sincronizar('itens', full)
    setCarregandoGlobal(false)
  }

  const getResultado = (tipo: string) => resultados.find((r) => r.tipo === tipo)

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg border" style={{backgroundColor: status.connected ? '#f0fdf4' : '#fef2f2', borderColor: status.connected ? '#86efac' : '#fecaca'}}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold" style={{color: status.connected ? '#15803d' : '#991b1b'}}>
              {status.connected ? '✓ Olist ERP Conectado' : '✕ Olist ERP Desconectado'}
            </h3>
            {status.connected && status.expiresAt && (
              <div className="text-sm mt-2 space-y-1" style={{color: '#166534'}}>
                <p>Token válido até: {new Date(status.expiresAt).toLocaleString('pt-BR')}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <a href="/api/olist/oauth/login" className="px-4 py-2 text-white text-sm font-semibold rounded-lg whitespace-nowrap" style={{backgroundColor: status.connected ? '#64748b' : '#dc2626'}}>
              {status.connected ? 'Reconectar' : 'Conectar'}
            </a>
            <button onClick={checkStatus} className="px-4 py-2 text-slate-700 text-sm font-semibold rounded-lg whitespace-nowrap border border-slate-300 hover:bg-slate-100">
              Recarregar
            </button>
          </div>
        </div>
      </div>

      {status.connected && (
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Sincronizar com Olist</h3>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => sincronizarTudo(false)}
            disabled={carregandoGlobal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            Tudo (incremental)
          </button>

          <button
            onClick={() => sincronizarTudo(true)}
            disabled={carregandoGlobal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Zap size={16} />
            Tudo (full)
          </button>

          <button
            onClick={() => sincronizar('categorias')}
            disabled={true}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-400 cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            title="Token não tem permissão para acessar categorias"
          >
            <RefreshCw size={16} />
            Categorias (indisponível)
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => sincronizar('produtos')}
            disabled={carregandoGlobal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            Produtos
          </button>

          <button
            onClick={() => sincronizar('pedidos')}
            disabled={carregandoGlobal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            Pedidos
          </button>

          <button
            onClick={() => sincronizar('itens')}
            disabled={carregandoGlobal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            Itens de Pedidos
          </button>
        </div>

        {/* Resultados */}
        {resultados.length > 0 && (
          <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-900">Resultados</h4>
          <div className="space-y-2">
            {resultados.map((resultado) => {
              const titulo = {
                pedidos: 'Pedidos',
                itens: 'Itens de Pedidos',
                produtos: 'Produtos',
                categorias: 'Categorias',
              }[resultado.tipo]

              return (
                <div
                  key={resultado.tipo}
                  className={`p-3 rounded-lg border ${
                    resultado.carregando
                      ? 'bg-blue-50 border-blue-200'
                      : resultado.sucesso
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{titulo}</div>
                      {resultado.carregando && (
                        <div className="text-xs text-slate-600 mt-1">Sincronizando...</div>
                      )}
                      {resultado.sucesso && resultado.dados && (
                        <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                          {Object.entries(resultado.dados).map(([key, value]) => (
                            <div key={key}>
                              <span className="font-medium">{key}:</span> {String(value)}
                            </div>
                          ))}
                        </div>
                      )}
                      {resultado.erro && (
                        <div className="text-xs text-red-700 mt-1">{resultado.erro}</div>
                      )}
                    </div>
                    {resultado.carregando && (
                      <RefreshCw className="animate-spin text-blue-600 flex-shrink-0" size={16} />
                    )}
                    {resultado.sucesso && (
                      <div className="text-green-600 flex-shrink-0">✓</div>
                    )}
                    {resultado.erro && (
                      <div className="text-red-600 flex-shrink-0">✕</div>
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
        <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 text-center">
          <p className="text-gray-700 text-sm">Conecte-se com o Olist ERP para acessar as opções de sincronização.</p>
        </div>
      )}
    </div>
  )
}
