import { Router, Request, Response } from 'express'
import { exchangeCode } from '../lib/olist/auth'
import { saveTokens } from '../lib/olist/tokens'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined
  const state = req.query.state as string | undefined
  const error = req.query.error as string | undefined
  const errorDesc = req.query.error_description as string | undefined

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000'

  console.log('[OAuth Callback] ============================================')
  console.log('[OAuth Callback] Parâmetros recebidos:', {
    code: code ? `${code.slice(0, 20)}...` : null,
    state: state ? `${state.slice(0, 20)}...` : null,
    error,
    errorDesc,
  })

  const savedState = req.cookies?.olist_oauth_state

  console.log('[OAuth Callback] Estado salvo:', savedState ? `${savedState.slice(0, 20)}...` : null)

  if (error) {
    console.error(`[OAuth] Erro do Tiny ERP: ${error} - ${errorDesc}`)
    return res.redirect(`${frontendUrl}/admin?error=oauth_failed`)
  }

  if (!state || state !== savedState) {
    console.error('[OAuth] Validação de state falhou')
    return res.redirect(`${frontendUrl}/admin?error=csrf`)
  }

  res.clearCookie('olist_oauth_state', { path: '/' })

  if (!code) {
    console.error('[OAuth] Nenhum código recebido')
    return res.redirect(`${frontendUrl}/admin?error=oauth_failed`)
  }

  try {
    console.log('[OAuth] Tentando trocar código por tokens...')
    const tokens = await exchangeCode(code)
    await saveTokens(tokens)
    console.log('[OAuth] Tokens salvos com sucesso!')
    return res.redirect(`${frontendUrl}/admin`)
  } catch (err) {
    console.error('[OAuth] Erro ao processar callback:', err)
    return res.redirect(`${frontendUrl}/admin?error=oauth_failed`)
  }
})

export default router
