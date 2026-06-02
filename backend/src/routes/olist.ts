import { Router, Request, Response } from 'express'
import { buildAuthUrl } from '../lib/olist/auth'
import { getStoredTokens, saveTokens } from '../lib/olist/tokens'
import { refreshTokens } from '../lib/olist/auth'
import { listarPedidos, type PedidoFiltro, PEDIDO_SITUACOES } from '../lib/olist/pedidos'
import { OlistAuthError, OlistApiError } from '../lib/olist/errors'
import { OLIST_CONFIG } from '../lib/olist/config'

const router = Router()

router.get('/oauth/login', (req: Request, res: Response) => {
  const state = crypto.randomUUID()

  res.cookie('olist_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 1000,
    path: '/',
  })

  const authUrl = buildAuthUrl(state)
  console.log('[OAuth Login] Redirecionando para:', authUrl.slice(0, 100) + '...')
  console.log('[OAuth Login] State salvo:', state.slice(0, 20) + '...')

  return res.redirect(authUrl)
})

router.get('/oauth/status', async (_req: Request, res: Response) => {
  const tokens = await getStoredTokens()

  if (!tokens) {
    return res.json({ connected: false })
  }

  return res.json({
    connected: true,
    expiresAt: tokens.expiresAt.toISOString(),
    obtainedAt: tokens.obtainedAt.toISOString(),
  })
})

function parseInteger(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function parseSituacao(value: string | null | undefined): PedidoFiltro['situacao'] {
  if (!value) return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  return PEDIDO_SITUACOES.includes(n as (typeof PEDIDO_SITUACOES)[number])
    ? (n as PedidoFiltro['situacao'])
    : undefined
}

function parseOrigemPedido(value: string | null | undefined): PedidoFiltro['origemPedido'] {
  if (value === '0') return 0
  if (value === '1') return 1
  return undefined
}

router.get('/pedidos', async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>
    const orderBy = q.orderBy

    const filtro: PedidoFiltro = {
      numero: parseInteger(q.numero),
      nomeCliente: q.nomeCliente,
      codigoCliente: q.codigoCliente,
      cpfCnpj: q.cpfCnpj,
      dataInicial: q.dataInicial,
      dataFinal: q.dataFinal,
      dataAtualizacao: q.dataAtualizacao,
      situacao: parseSituacao(q.situacao),
      numeroPedidoEcommerce: q.numeroPedidoEcommerce,
      idVendedor: parseInteger(q.idVendedor),
      marcadores: q.marcadores ? [q.marcadores] : [],
      origemPedido: parseOrigemPedido(q.origemPedido),
      orderBy: orderBy === 'asc' || orderBy === 'desc' ? orderBy : undefined,
      limit: parseInteger(q.limit),
      offset: parseInteger(q.offset),
    }

    const listagem = await listarPedidos(filtro)
    return res.json(listagem)
  } catch (err) {
    if (err instanceof OlistAuthError) {
      return res.status(401).json({ error: 'Olist não conectado. Acesse /admin/olist para reconectar.' })
    }
    if (err instanceof OlistApiError) {
      return res.status(502).json({ error: `API Olist retornou ${err.status}`, detalhe: err.body })
    }
    console.error('Erro ao listar pedidos da Olist:', err)
    return res.status(500).json({ error: String(err) })
  }
})

router.get('/debug', async (_req: Request, res: Response) => {
  const tokens = await getStoredTokens()

  if (!tokens) {
    return res.status(400).json({ error: 'Nenhum token salvo no Supabase.' })
  }

  const now = new Date()
  const expired = tokens.expiresAt <= now

  async function testEndpoint(baseUrl: string, path: string, token: string) {
    try {
      const r = await fetch(`${baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      const body = await r.text()
      let parsedBody: unknown = body
      try {
        parsedBody = JSON.parse(body)
      } catch {
        // not json
      }
      return { path, status: r.status, ok: r.ok, body: parsedBody, statusText: r.statusText }
    } catch (err) {
      return { path, status: 0, ok: false, body: String(err), error: 'Network error' }
    }
  }

  const endpointsToTest = ['/categorias/todas', '/categorias', '/categorias?limit=10', '/produtos', '/pedidos']
  const results = await Promise.all(
    endpointsToTest.map((ep) => testEndpoint(OLIST_CONFIG.apiBaseUrl, ep, tokens.accessToken))
  )

  return res.json({
    api_base_url: OLIST_CONFIG.apiBaseUrl,
    token_expires_at: tokens.expiresAt.toISOString(),
    token_expired: expired,
    token_preview: tokens.accessToken.slice(0, 20) + '...',
    endpoints_tested: results,
  })
})

router.get('/refresh-token', async (_req: Request, res: Response) => {
  try {
    const stored = await getStoredTokens()

    if (!stored) {
      return res.status(401).json({ connected: false, error: 'Nenhum token Olist salvo' })
    }

    const now = new Date()
    const timeUntilExpiry = stored.expiresAt.getTime() - now.getTime()
    const hoursUntilExpiry = timeUntilExpiry / (1000 * 60 * 60)
    const minutesUntilExpiry = (timeUntilExpiry / (1000 * 60)) % 60

    return res.json({
      connected: true,
      expires_at: stored.expiresAt.toISOString(),
      expires_in: `${Math.floor(hoursUntilExpiry)}h ${Math.floor(minutesUntilExpiry)}m`,
      needs_refresh: hoursUntilExpiry < 1,
      hours_until_expiry: hoursUntilExpiry,
    })
  } catch (err) {
    console.error('Erro ao verificar token Olist:', err)
    return res.status(500).json({ connected: false, error: String(err) })
  }
})

router.post('/refresh-token', async (_req: Request, res: Response) => {
  try {
    const stored = await getStoredTokens()

    if (!stored) {
      return res.status(401).json({ error: 'Nenhum token Olist salvo. Faça login em /admin/olist primeiro.' })
    }

    const now = new Date()
    const timeUntilExpiry = stored.expiresAt.getTime() - now.getTime()
    const hoursUntilExpiry = timeUntilExpiry / (1000 * 60 * 60)

    if (hoursUntilExpiry < 1) {
      const fresh = await refreshTokens(stored.refreshToken)
      await saveTokens(fresh)

      return res.json({
        message: 'Token renovado com sucesso',
        renewed: true,
        expires_at: fresh.expiresAt.toISOString(),
        hours_until_expiry: (fresh.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60),
      })
    }

    return res.json({
      message: 'Token ainda é válido',
      renewed: false,
      expires_at: stored.expiresAt.toISOString(),
      hours_until_expiry: hoursUntilExpiry,
    })
  } catch (err) {
    if (err instanceof OlistAuthError) {
      return res.status(401).json({
        error: 'Falha ao renovar token. Faça login novamente em /admin/olist',
        details: err.message,
      })
    }
    console.error('Erro ao renovar token Olist:', err)
    return res.status(500).json({ error: 'Erro ao renovar token', details: String(err) })
  }
})

export default router
