import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCode } from '@/lib/olist/auth'
import { saveTokens } from '@/lib/olist/tokens'
import { OlistAuthError } from '@/lib/olist/errors'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDesc = searchParams.get('error_description')

  console.log('[OAuth Callback] Parâmetros recebidos:', {
    code: code ? `${code.slice(0, 20)}...` : null,
    state: state ? `${state.slice(0, 20)}...` : null,
    error,
    errorDesc,
  })

  const cookieStore = await cookies()
  const storedState = cookieStore.get('olist_oauth_state')?.value

  console.log('[OAuth Callback] Estado armazenado:', storedState ? `${storedState.slice(0, 20)}...` : null)

  // Verificar estado (CSRF protection)
  if (!storedState || state !== storedState) {
    console.error('[OAuth] Falha na validação de estado', {
      hasStoredState: !!storedState,
      statesMatch: state === storedState,
    })
    return NextResponse.redirect(`/admin/olist?error=csrf`)
  }

  // Limpar cookie de estado
  cookieStore.delete('olist_oauth_state')

  // Verificar se houve erro do servidor Olist
  if (error) {
    console.error(`[OAuth] Erro do Tiny ERP: ${error} - ${errorDesc}`)
    return NextResponse.redirect(`/admin/olist?error=oauth_failed`)
  }

  // Verificar se recebemos o código
  if (!code) {
    console.error('[OAuth] Nenhum código recebido')
    return NextResponse.redirect(`/admin/olist?error=oauth_failed`)
  }

  try {
    // Trocar código por tokens
    const tokens = await exchangeCode(code)
    await saveTokens(tokens)

    console.log('[OAuth] Tokens salvos com sucesso')
    return NextResponse.redirect(`/admin/olist?connected=true`)
  } catch (err) {
    if (err instanceof OlistAuthError) {
      console.error(`[OAuth] Erro ao trocar código: ${err.message}`)
    } else {
      console.error('[OAuth] Erro inesperado:', err)
    }
    return NextResponse.redirect(`/admin/olist?error=oauth_failed`)
  }
}
