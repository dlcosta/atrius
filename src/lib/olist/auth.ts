import { OLIST_CONFIG } from './config'
import { OlistAuthError } from './errors'
import { StoredTokens } from './tokens'

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: OLIST_CONFIG.clientId,
    redirect_uri: OLIST_CONFIG.redirectUri,
    scope: OLIST_CONFIG.scope,
    response_type: 'code',
    state,
  })
  return `${OLIST_CONFIG.authUrl}?${params.toString()}`
}

async function postToken(body: URLSearchParams): Promise<StoredTokens> {
  const res = await fetch(OLIST_CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    if (text.includes('invalid_grant')) {
      throw new OlistAuthError('refresh_failed', 'Refresh token inválido ou expirado.')
    }
    throw new OlistAuthError('unauthorized', `Token endpoint retornou ${res.status}: ${text}`)
  }

  const json = await res.json()
  const now = Date.now()
  const expiresIn: number = json.expires_in ?? 14400

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(now + (expiresIn - 60) * 1000),
    obtainedAt: new Date(now),
  }
}

export async function exchangeCode(code: string): Promise<StoredTokens> {
  return postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OLIST_CONFIG.clientId,
      client_secret: OLIST_CONFIG.clientSecret,
      redirect_uri: OLIST_CONFIG.redirectUri,
      code,
    })
  )
}

export async function refreshTokens(refreshToken: string): Promise<StoredTokens> {
  return postToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: OLIST_CONFIG.clientId,
      client_secret: OLIST_CONFIG.clientSecret,
      refresh_token: refreshToken,
    })
  )
}
