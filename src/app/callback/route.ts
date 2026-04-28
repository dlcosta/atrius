import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCode } from '@/lib/olist/auth'
import { saveTokens } from '@/lib/olist/tokens'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const savedState = cookieStore.get('olist_oauth_state')?.value

  if (!state || state !== savedState) {
    return NextResponse.redirect(new URL('/admin/olist?error=csrf', request.url))
  }

  cookieStore.delete('olist_oauth_state')

  if (!code) {
    return NextResponse.redirect(new URL('/admin/olist?error=oauth_failed', request.url))
  }

  try {
    const tokens = await exchangeCode(code)
    await saveTokens(tokens)
    return NextResponse.redirect(new URL('/admin/olist', request.url))
  } catch {
    return NextResponse.redirect(new URL('/admin/olist?error=oauth_failed', request.url))
  }
}
