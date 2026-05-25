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
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRateLimitRetry(
  path: string,
  init: RequestInit | undefined,
  accessToken: string
): Promise<Response> {
  let res = await doFetch(path, init, accessToken)

  for (let tentativa = 1; res.status === 429 && tentativa <= 8; tentativa++) {
    const retryAfter = Number(res.headers.get('retry-after'))
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 5000 * tentativa

    await delay(waitMs)
    res = await doFetch(path, init, accessToken)
  }

  return res
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

  let res = await fetchWithRateLimitRetry(path, init, accessToken)

  if (res.status === 401) {
    const fresh = await refreshTokens(refreshToken)
    await saveTokens(fresh)
    res = await fetchWithRateLimitRetry(path, init, fresh.accessToken)

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
