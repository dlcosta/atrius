import { NextResponse } from 'next/server'
import { getStoredTokens } from '@/lib/olist/tokens'
import { OLIST_CONFIG } from '@/lib/olist/config'

async function testEndpoint(baseUrl: string, path: string, token: string) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })
    const body = await res.text()
    return {
      path,
      status: res.status,
      ok: res.ok,
      body: body.slice(0, 500),
      error: !res.ok ? `HTTP ${res.status}` : null,
    }
  } catch (err) {
    return {
      path,
      status: 0,
      ok: false,
      body: '',
      error: String(err),
    }
  }
}

export async function GET() {
  const tokens = await getStoredTokens()

  if (!tokens) {
    return NextResponse.json({ error: 'Nenhum token salvo no Supabase.' }, { status: 400 })
  }

  const now = new Date()
  const expired = tokens.expiresAt <= now

  // Testar vários endpoints
  const endpointsToTest = [
    '/categorias/todas',
    '/categorias',
    '/produtos',
    '/pedidos',
  ]

  const results = await Promise.all(
    endpointsToTest.map((ep) => testEndpoint(OLIST_CONFIG.apiBaseUrl, ep, tokens.accessToken))
  )

  return NextResponse.json({
    api_base_url: OLIST_CONFIG.apiBaseUrl,
    token_expires_at: tokens.expiresAt.toISOString(),
    token_expired: expired,
    token_preview: tokens.accessToken.slice(0, 20) + '...',
    endpoints_tested: results,
  })
}
