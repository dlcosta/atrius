import { createServiceClient } from '@/lib/supabase/service'

export type StoredTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  obtainedAt: Date
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('olist_oauth_tokens')
    .select('access_token, refresh_token, expires_at, obtained_at')
    .eq('id', 1)
    .single()

  if (error || !data) return null

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at),
    obtainedAt: new Date(data.obtained_at),
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('olist_oauth_tokens').upsert(
    {
      id: 1,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt.toISOString(),
      obtained_at: tokens.obtainedAt.toISOString(),
    },
    { onConflict: 'id' }
  )

  if (error) throw new Error(`Falha ao salvar tokens Olist: ${error.message}`)
}
