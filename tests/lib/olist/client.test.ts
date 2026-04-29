import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OlistAuthError } from '@/lib/olist/errors'

vi.mock('@/lib/olist/tokens', () => ({
  getStoredTokens: vi.fn(),
  saveTokens: vi.fn(),
}))

vi.mock('@/lib/olist/auth', () => ({
  refreshTokens: vi.fn(),
}))

vi.mock('@/lib/olist/config', () => ({
  OLIST_CONFIG: { apiBaseUrl: 'https://api.example.com' },
}))

const { getStoredTokens, saveTokens } = await import('@/lib/olist/tokens')
const { refreshTokens } = await import('@/lib/olist/auth')
const { olistFetch } = await import('@/lib/olist/client')

const futureDate = new Date(Date.now() + 3600 * 1000)
const pastDate = new Date(Date.now() - 1000)

const validTokens = {
  accessToken: 'valid-token',
  refreshToken: 'refresh-token',
  expiresAt: futureDate,
  obtainedAt: new Date(),
}

const refreshedTokens = {
  accessToken: 'new-token',
  refreshToken: 'new-refresh',
  expiresAt: futureDate,
  obtainedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('olistFetch', () => {
  it('chama fetch uma vez com token válido, sem refresh', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue(validTokens)
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    await olistFetch('/categorias/todas')

    expect(refreshTokens).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/categorias/todas',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer valid-token' }),
      })
    )
  })

  it('faz refresh quando token expirado e repete chamada com novo token', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue({ ...validTokens, expiresAt: pastDate })
    vi.mocked(refreshTokens).mockResolvedValue(refreshedTokens)
    vi.mocked(saveTokens).mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    await olistFetch('/categorias/todas')

    expect(refreshTokens).toHaveBeenCalledWith('refresh-token')
    expect(saveTokens).toHaveBeenCalledWith(refreshedTokens)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/categorias/todas',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer new-token' }),
      })
    )
  })

  it('lança OlistAuthError("not_connected") quando não há tokens', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue(null)

    await expect(olistFetch('/categorias/todas')).rejects.toMatchObject({
      name: 'OlistAuthError',
      code: 'not_connected',
    })
  })

  it('em 401, faz refresh + retry e retorna sucesso', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue(validTokens)
    vi.mocked(refreshTokens).mockResolvedValue(refreshedTokens)
    vi.mocked(saveTokens).mockResolvedValue(undefined)
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const res = await olistFetch('/categorias/todas')

    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('em 401 → refresh → 401 de novo, lança OlistAuthError("unauthorized")', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue(validTokens)
    vi.mocked(refreshTokens).mockResolvedValue(refreshedTokens)
    vi.mocked(saveTokens).mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }))

    await expect(olistFetch('/categorias/todas')).rejects.toMatchObject({
      name: 'OlistAuthError',
      code: 'unauthorized',
    })
  })
})
