import { getStoredTokens } from '@/lib/olist/tokens'
import OlistActions from './OlistActions'

type ConnectionStatus =
  | { connected: false }
  | { connected: true; expiresAt: string; obtainedAt: string }

async function getStatus(): Promise<ConnectionStatus> {
  const tokens = await getStoredTokens()
  if (!tokens) return { connected: false }
  return {
    connected: true,
    expiresAt: tokens.expiresAt.toISOString(),
    obtainedAt: tokens.obtainedAt.toISOString(),
  }
}

export default async function OlistAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const status = await getStatus()

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-semibold mb-6">Integração Olist ERP</h1>

      {error === 'csrf' && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">
          Erro de segurança na autenticação. Tente novamente.
        </div>
      )}
      {error === 'oauth_failed' && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">
          Falha na autenticação com o Olist. Tente novamente.
        </div>
      )}

      {!status.connected ? (
        <div className="p-4 bg-yellow-50 border border-yellow-300 rounded mb-4">
          <p className="font-medium text-yellow-800">Olist ERP não conectado</p>
          <p className="text-sm text-yellow-700 mt-1">Nenhum token encontrado.</p>
        </div>
      ) : (
        <div className="p-4 bg-green-50 border border-green-300 rounded mb-4">
          <p className="font-medium text-green-800">Olist ERP conectado</p>
          <p className="text-sm text-green-700 mt-1">
            Token válido até:{' '}
            {new Date(status.expiresAt).toLocaleString('pt-BR')}
          </p>
          <p className="text-sm text-green-700">
            Obtido em: {new Date(status.obtainedAt).toLocaleString('pt-BR')}
          </p>
        </div>
      )}

      <OlistActions connected={status.connected} />
    </div>
  )
}
