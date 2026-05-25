import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { buildAuthUrl } from '@/lib/olist/auth'

export async function GET() {
  const state = crypto.randomUUID()
  const cookieStore = await cookies()

  cookieStore.set('olist_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60,
    path: '/',
  })

  const authUrl = buildAuthUrl(state)
  console.log('[OAuth Login] Redirecionando para:', authUrl.slice(0, 100) + '...')
  console.log('[OAuth Login] State salvo:', state.slice(0, 20) + '...')

  return NextResponse.redirect(authUrl)
}
