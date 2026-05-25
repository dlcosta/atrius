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
    let parsedBody: unknown = body
    try {
      parsedBody = JSON.parse(body)
    } catch {
      // not json, keep as string
    }
    return {
      path,
      status: res.status,
      ok: res.ok,
      body: parsedBody,
      statusText: res.statusText,
    }
  } catch (err) {
    return {
      path,
      status: 0,
      ok: false,
      body: String(err),
      error: 'Network error',
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
    '/categorias?limit=10',
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
