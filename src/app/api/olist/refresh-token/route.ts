import { NextResponse } from 'next/server'
import { getStoredTokens, saveTokens } from '@/lib/olist/tokens'
import { refreshTokens } from '@/lib/olist/auth'
import { OlistAuthError } from '@/lib/olist/errors'

export async function POST() {
  try {
    const stored = await getStoredTokens()

    if (!stored) {
      return NextResponse.json(
        { error: 'Nenhum token Olist salvo. Faça login em /admin/olist primeiro.' },
        { status: 401 }
      )
    }

    const now = new Date()
    const timeUntilExpiry = stored.expiresAt.getTime() - now.getTime()
    const hoursUntilExpiry = timeUntilExpiry / (1000 * 60 * 60)

    // Se token expira em menos de 1 hora, renovar
    if (hoursUntilExpiry < 1) {
      const fresh = await refreshTokens(stored.refreshToken)
      await saveTokens(fresh)

      return NextResponse.json({
        message: 'Token renovado com sucesso',
        renewed: true,
        expires_at: fresh.expiresAt.toISOString(),
        hours_until_expiry: (fresh.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60),
      })
    }

    return NextResponse.json({
      message: 'Token ainda é válido',
      renewed: false,
      expires_at: stored.expiresAt.toISOString(),
      hours_until_expiry: hoursUntilExpiry,
    })
  } catch (err) {
    if (err instanceof OlistAuthError) {
      return NextResponse.json(
        {
          error: 'Falha ao renovar token. Faça login novamente em /admin/olist',
          details: err.message,
        },
        { status: 401 }
      )
    }

    console.error('Erro ao renovar token Olist:', err)
    return NextResponse.json(
      { error: 'Erro ao renovar token', details: String(err) },
      { status: 500 }
    )
  }
}

// GET para apenas verificar status sem renovar
export async function GET() {
  try {
    const stored = await getStoredTokens()

    if (!stored) {
      return NextResponse.json(
        { connected: false, error: 'Nenhum token Olist salvo' },
        { status: 401 }
      )
    }

    const now = new Date()
    const timeUntilExpiry = stored.expiresAt.getTime() - now.getTime()
    const hoursUntilExpiry = timeUntilExpiry / (1000 * 60 * 60)
    const minutesUntilExpiry = (timeUntilExpiry / (1000 * 60)) % 60

    return NextResponse.json({
      connected: true,
      expires_at: stored.expiresAt.toISOString(),
      expires_in: `${Math.floor(hoursUntilExpiry)}h ${Math.floor(minutesUntilExpiry)}m`,
      needs_refresh: hoursUntilExpiry < 1,
      hours_until_expiry: hoursUntilExpiry,
    })
  } catch (err) {
    console.error('Erro ao verificar token Olist:', err)
    return NextResponse.json(
      { connected: false, error: String(err) },
      { status: 500 }
    )
  }
}
