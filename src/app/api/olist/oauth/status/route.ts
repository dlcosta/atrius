import { NextResponse } from 'next/server'
import { getStoredTokens } from '@/lib/olist/tokens'

export async function GET() {
  const tokens = await getStoredTokens()

  if (!tokens) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({
    connected: true,
    expiresAt: tokens.expiresAt.toISOString(),
    obtainedAt: tokens.obtainedAt.toISOString(),
  })
}
