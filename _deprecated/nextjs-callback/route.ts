import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCode } from '@/lib/olist/auth'
import { saveTokens } from '@/lib/olist/tokens'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDesc = searchParams.get('error_description')

  console.log('[OAuth Callback] ============================================')
  console.log('[OAuth Callback] URL:', request.url)
  console.log('[OAuth Callback] Parâmetros recebidos:', {
    code: code ? `${code.slice(0, 20)}...` : null,
    state: state ? `${state.slice(0, 20)}...` : null,
    error,
    errorDesc,
  })

  const cookieStore = await cookies()
  const savedState = cookieStore.get('olist_oauth_state')?.value

  console.log('[OAuth Callback] Estado salvo:', savedState ? `${savedState.slice(0, 20)}...` : null)

  // Verificar se houve erro do servidor Olist
  if (error) {
    console.error(`[OAuth] Erro do Tiny ERP: ${error} - ${errorDesc}`)
    return NextResponse.redirect(new URL(`/admin?error=oauth_failed`, request.url))
  }

  if (!state || state !== savedState) {
    console.error('[OAuth] Validação de state falhou')
    return NextResponse.redirect(new URL('/admin?error=csrf', request.url))
  }

  cookieStore.delete('olist_oauth_state')

  if (!code) {
    console.error('[OAuth] Nenhum código recebido')
    return NextResponse.redirect(new URL('/admin?error=oauth_failed', request.url))
  }

  try {
    console.log('[OAuth] Tentando trocar código por tokens...')
    const tokens = await exchangeCode(code)
    await saveTokens(tokens)
    console.log('[OAuth] Tokens salvos com sucesso!')
    return NextResponse.redirect(new URL('/admin', request.url))
  } catch (err) {
    console.error('[OAuth] Erro ao processar callback:', err)
    return NextResponse.redirect(new URL('/admin?error=oauth_failed', request.url))
  }
}
