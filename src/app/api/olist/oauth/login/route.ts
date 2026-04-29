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

  return NextResponse.redirect(buildAuthUrl(state))
}
