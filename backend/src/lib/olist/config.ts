export const OLIST_CONFIG = {
  apiBaseUrl: process.env.OLIST_API_BASE_URL ?? 'https://api.tiny.com.br/public-api/v3',
  authUrl: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth',
  tokenUrl: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
  scope: 'openid offline_access',
  clientId: process.env.OLIST_CLIENT_ID!,
  clientSecret: process.env.OLIST_CLIENT_SECRET!,
  redirectUri: process.env.OLIST_REDIRECT_URI!,
}
