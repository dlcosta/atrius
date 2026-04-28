import { OLIST_CONFIG } from './config'
import { OlistAuthError, OlistApiError } from './errors'
import { getStoredTokens, saveTokens } from './tokens'
import { refreshTokens } from './auth'

async function doFetch(path: string, init: RequestInit | undefined, accessToken: string): Promise<Response> {
  return fetch(`${OLIST_CONFIG.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })
}

export async function olistFetch(path: string, init?: RequestInit): Promise<Response> {
  const stored = await getStoredTokens()

  if (!stored) {
    throw new OlistAuthError('not_connected')
  }

  let { accessToken, refreshToken } = stored

  if (stored.expiresAt <= new Date()) {
    const fresh = await refreshTokens(refreshToken)
    await saveTokens(fresh)
    accessToken = fresh.accessToken
    refreshToken = fresh.refreshToken
  }

  let res = await doFetch(path, init, accessToken)

  if (res.status === 401) {
    const fresh = await refreshTokens(refreshToken)
    await saveTokens(fresh)
    res = await doFetch(path, init, fresh.accessToken)

    if (res.status === 401) {
      throw new OlistAuthError('unauthorized')
    }
  }

  if (!res.ok) {
    const body = await res.text()
    throw new OlistApiError(res.status, body)
  }

  return res
}
