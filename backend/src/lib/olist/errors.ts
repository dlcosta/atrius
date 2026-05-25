export class OlistAuthError extends Error {
  code: 'not_connected' | 'refresh_failed' | 'unauthorized'

  constructor(code: 'not_connected' | 'refresh_failed' | 'unauthorized', message?: string) {
    super(message ?? code)
    this.name = 'OlistAuthError'
    this.code = code
  }
}

export class OlistApiError extends Error {
  status: number
  body: string

  constructor(status: number, body: string) {
    super(`Olist API error ${status}: ${body}`)
    this.name = 'OlistApiError'
    this.status = status
    this.body = body
  }
}
