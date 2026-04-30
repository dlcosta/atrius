import { NextResponse } from 'next/server'
import { getStoredTokens } from '@/lib/olist/tokens'
import { OLIST_CONFIG } from '@/lib/olist/config'

export async function GET() {
  const tokens = await getStoredTokens()

  if (!tokens) {
    return NextResponse.json({ error: 'Nenhum token salvo no Supabase.' }, { status: 400 })
  }

  const now = new Date()
  const expired = tokens.expiresAt <= now

  const endpoints = ['/produtos/454266415', '/produtos/454286019']
  const results: Record<string, { status: number; body: string }> = {}

  for (const ep of endpoints) {
    const r = await fetch(`${OLIST_CONFIG.apiBaseUrl}${ep}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    results[ep] = { status: r.status, body: (await r.text()).slice(0, 2000) }
  }

  const res = await fetch(`${OLIST_CONFIG.apiBaseUrl}/categorias/todas`, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const body = await res.text()

  return NextResponse.json({
    token_expires_at: tokens.expiresAt.toISOString(),
    token_expired: expired,
    token_preview: tokens.accessToken.slice(0, 20) + '...',
    api_status: res.status,
    api_body: body.slice(0, 500),
    endpoints: results,
  })
}
