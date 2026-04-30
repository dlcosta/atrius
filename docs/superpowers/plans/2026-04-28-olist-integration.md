# Olist ERP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar cliente Olist ERP genérico com OAuth 2.0 e refresh automático de tokens, sincronização completa de categorias, e painel admin para gerenciar a conexão.

**Architecture:** Módulo `src/lib/olist/` separado por responsabilidade (config → errors → tokens → auth → client → categorias). O `olistFetch()` em `client.ts` é o único ponto que conhece OAuth — todos os endpoints consomem só ele. Tokens são persistidos em tabela Supabase acessada via service role key.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), TypeScript, Supabase (@supabase/ssr + supabase-js), Vitest, Tailwind CSS 4.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/005_olist_oauth_tokens.sql` | Criar | Tabela de tokens OAuth (1 linha, RLS fechada) |
| `src/lib/olist/config.ts` | Criar | Constantes e env vars da Olist |
| `src/lib/olist/errors.ts` | Criar | `OlistAuthError`, `OlistApiError` |
| `src/lib/supabase/service.ts` | Criar | Client Supabase com service role key |
| `src/lib/olist/tokens.ts` | Criar | CRUD de tokens no Supabase |
| `src/lib/olist/auth.ts` | Criar | buildAuthUrl, exchangeCode, refreshTokens |
| `src/lib/olist/client.ts` | Criar | `olistFetch()` com refresh automático |
| `src/lib/olist/categorias.ts` | Criar | Tipos, parsing, flatten, fetch de categorias |
| `tests/lib/olist/categorias.test.ts` | Criar | Testes de parsing e flatten |
| `tests/lib/olist/client.test.ts` | Criar | Testes de olistFetch com mocks |
| `src/app/api/olist/oauth/login/route.ts` | Criar | Inicia fluxo OAuth (gera state, redireciona) |
| `src/app/api/olist/oauth/status/route.ts` | Criar | Retorna estado da conexão para a UI |
| `src/app/callback/route.ts` | Criar | Recebe code do Olist, troca por tokens |
| `src/app/(dashboard)/admin/olist/page.tsx` | Criar | Painel de integração |
| `src/app/api/sincronizar/categorias/route.ts` | Modificar | Trocar import e tratar OlistAuthError |
| `src/lib/sync/olist-categorias.ts` | Deletar | Migrado para lib/olist/categorias.ts |
| `.env.example` | Modificar | Adicionar novas vars, remover OLIST_ACCESS_TOKEN |

---

## Task 1: Migration da tabela de tokens

**Files:**
- Create: `supabase/migrations/005_olist_oauth_tokens.sql`

- [ ] **Step 1: Criar a migration**

Crie o arquivo `supabase/migrations/005_olist_oauth_tokens.sql` com o conteúdo:

```sql
create table if not exists olist_oauth_tokens (
  id integer primary key default 1,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  obtained_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

alter table olist_oauth_tokens enable row level security;
-- Sem policies: apenas service_role (que bypassa RLS) tem acesso.
```

- [ ] **Step 2: Rodar a migration no Supabase**

Acesse o painel do Supabase → SQL Editor → cole o conteúdo acima → Execute.

Verifique que a tabela `olist_oauth_tokens` aparece em Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_olist_oauth_tokens.sql
git commit -m "feat: migration tabela olist_oauth_tokens"
```

---

## Task 2: Configuração e erros

**Files:**
- Create: `src/lib/olist/config.ts`
- Create: `src/lib/olist/errors.ts`

- [ ] **Step 1: Criar `src/lib/olist/config.ts`**

```ts
export const OLIST_CONFIG = {
  apiBaseUrl: process.env.OLIST_API_BASE_URL ?? 'https://api.tiny.com.br/public-api/v3',
  authUrl: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth',
  tokenUrl: 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
  scope: 'openid offline_access',
  clientId: process.env.OLIST_CLIENT_ID!,
  clientSecret: process.env.OLIST_CLIENT_SECRET!,
  redirectUri: process.env.OLIST_REDIRECT_URI!,
}
```

- [ ] **Step 2: Criar `src/lib/olist/errors.ts`**

```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/olist/config.ts src/lib/olist/errors.ts
git commit -m "feat: config e classes de erro do cliente Olist"
```

---

## Task 3: Supabase service client + tokens

**Files:**
- Create: `src/lib/supabase/service.ts`
- Create: `src/lib/olist/tokens.ts`

- [ ] **Step 1: Criar `src/lib/supabase/service.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 2: Criar `src/lib/olist/tokens.ts`**

```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/service.ts src/lib/olist/tokens.ts
git commit -m "feat: service client Supabase e CRUD de tokens Olist"
```

---

## Task 4: Auth OAuth (buildAuthUrl, exchangeCode, refreshTokens)

**Files:**
- Create: `src/lib/olist/auth.ts`

- [ ] **Step 1: Criar `src/lib/olist/auth.ts`**

```ts
import { OLIST_CONFIG } from './config'
import { OlistAuthError } from './errors'
import { StoredTokens } from './tokens'

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: OLIST_CONFIG.clientId,
    redirect_uri: OLIST_CONFIG.redirectUri,
    scope: OLIST_CONFIG.scope,
    response_type: 'code',
    state,
  })
  return `${OLIST_CONFIG.authUrl}?${params.toString()}`
}

async function postToken(body: URLSearchParams): Promise<StoredTokens> {
  const res = await fetch(OLIST_CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    if (text.includes('invalid_grant')) {
      throw new OlistAuthError('refresh_failed', 'Refresh token inválido ou expirado.')
    }
    throw new OlistAuthError('unauthorized', `Token endpoint retornou ${res.status}: ${text}`)
  }

  const json = await res.json()
  const now = Date.now()
  const expiresIn: number = json.expires_in ?? 14400

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(now + (expiresIn - 60) * 1000),
    obtainedAt: new Date(now),
  }
}

export async function exchangeCode(code: string): Promise<StoredTokens> {
  return postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OLIST_CONFIG.clientId,
      client_secret: OLIST_CONFIG.clientSecret,
      redirect_uri: OLIST_CONFIG.redirectUri,
      code,
    })
  )
}

export async function refreshTokens(refreshToken: string): Promise<StoredTokens> {
  return postToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: OLIST_CONFIG.clientId,
      client_secret: OLIST_CONFIG.clientSecret,
      refresh_token: refreshToken,
    })
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/olist/auth.ts
git commit -m "feat: OAuth buildAuthUrl, exchangeCode e refreshTokens"
```

---

## Task 5: olistFetch — cliente HTTP com refresh automático

**Files:**
- Create: `src/lib/olist/client.ts`
- Create: `tests/lib/olist/client.test.ts`

- [ ] **Step 1: Escrever os testes que ainda vão falhar**

Crie `tests/lib/olist/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OlistAuthError, OlistApiError } from '@/lib/olist/errors'

vi.mock('@/lib/olist/tokens', () => ({
  getStoredTokens: vi.fn(),
  saveTokens: vi.fn(),
}))

vi.mock('@/lib/olist/auth', () => ({
  refreshTokens: vi.fn(),
}))

vi.mock('@/lib/olist/config', () => ({
  OLIST_CONFIG: { apiBaseUrl: 'https://api.example.com' },
}))

const { getStoredTokens, saveTokens } = await import('@/lib/olist/tokens')
const { refreshTokens } = await import('@/lib/olist/auth')
const { olistFetch } = await import('@/lib/olist/client')

const futureDate = new Date(Date.now() + 3600 * 1000)
const pastDate = new Date(Date.now() - 1000)

const validTokens = {
  accessToken: 'valid-token',
  refreshToken: 'refresh-token',
  expiresAt: futureDate,
  obtainedAt: new Date(),
}

const refreshedTokens = {
  accessToken: 'new-token',
  refreshToken: 'new-refresh',
  expiresAt: futureDate,
  obtainedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('olistFetch', () => {
  it('chama fetch uma vez com token válido, sem refresh', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue(validTokens)
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    await olistFetch('/categorias/todas')

    expect(refreshTokens).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/categorias/todas',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer valid-token' }),
      })
    )
  })

  it('faz refresh quando token expirado e repete chamada com novo token', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue({ ...validTokens, expiresAt: pastDate })
    vi.mocked(refreshTokens).mockResolvedValue(refreshedTokens)
    vi.mocked(saveTokens).mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    await olistFetch('/categorias/todas')

    expect(refreshTokens).toHaveBeenCalledWith('refresh-token')
    expect(saveTokens).toHaveBeenCalledWith(refreshedTokens)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/categorias/todas',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer new-token' }),
      })
    )
  })

  it('lança OlistAuthError("not_connected") quando não há tokens', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue(null)

    await expect(olistFetch('/categorias/todas')).rejects.toMatchObject({
      name: 'OlistAuthError',
      code: 'not_connected',
    })
  })

  it('em 401, faz refresh + retry e retorna sucesso', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue(validTokens)
    vi.mocked(refreshTokens).mockResolvedValue(refreshedTokens)
    vi.mocked(saveTokens).mockResolvedValue(undefined)
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const res = await olistFetch('/categorias/todas')

    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('em 401 → refresh → 401 de novo, lança OlistAuthError("unauthorized")', async () => {
    vi.mocked(getStoredTokens).mockResolvedValue(validTokens)
    vi.mocked(refreshTokens).mockResolvedValue(refreshedTokens)
    vi.mocked(saveTokens).mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }))

    await expect(olistFetch('/categorias/todas')).rejects.toMatchObject({
      name: 'OlistAuthError',
      code: 'unauthorized',
    })
  })
})
```

- [ ] **Step 2: Rodar testes e confirmar que falham**

```bash
cd atrius-planner && npx vitest run tests/lib/olist/client.test.ts
```

Esperado: erro de módulo não encontrado (`@/lib/olist/client`).

- [ ] **Step 3: Criar `src/lib/olist/client.ts`**

```ts
import { OLIST_CONFIG } from './config'
import { OlistAuthError, OlistApiError } from './errors'
import { getStoredTokens, saveTokens } from './tokens'
import { refreshTokens } from './auth'

async function doFetch(path: string, init: RequestInit | undefined, accessToken: string): Promise<Response> {
  return fetch(`${OLIST_CONFIG.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })
}

export async function olistFetch(path: string, init?: RequestInit): Promise<Response> {
  const stored = await getStoredTokens()

  if (!stored) {
    throw new OlistAuthError('not_connected')
  }

  let { accessToken, refreshToken } = stored

  if (stored.expiresAt <= new Date()) {
    const fresh = await refreshTokens(refreshToken)
    await saveTokens(fresh)
    accessToken = fresh.accessToken
    refreshToken = fresh.refreshToken
  }

  let res = await doFetch(path, init, accessToken)

  if (res.status === 401) {
    const fresh = await refreshTokens(refreshToken)
    await saveTokens(fresh)
    res = await doFetch(path, init, fresh.accessToken)

    if (res.status === 401) {
      throw new OlistAuthError('unauthorized')
    }
  }

  if (!res.ok) {
    const body = await res.text()
    throw new OlistApiError(res.status, body)
  }

  return res
}
```

- [ ] **Step 4: Rodar testes e confirmar que passam**

```bash
npx vitest run tests/lib/olist/client.test.ts
```

Esperado: 5 testes passando.

- [ ] **Step 5: Commit**

```bash
git add src/lib/olist/client.ts tests/lib/olist/client.test.ts
git commit -m "feat: olistFetch com refresh automático de token (TDD)"
```

---

## Task 6: Módulo de categorias (migração do código existente)

**Files:**
- Create: `src/lib/olist/categorias.ts`
- Create: `tests/lib/olist/categorias.test.ts`
- Delete: `src/lib/sync/olist-categorias.ts`

- [ ] **Step 1: Escrever os testes**

Crie `tests/lib/olist/categorias.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import {
  parseCategoriaNode,
  extrairCategoriasResposta,
  flattenCategoriasArvore,
} from '@/lib/olist/categorias'

describe('parseCategoriaNode', () => {
  it('parseia nó válido com filhas', () => {
    const resultado = parseCategoriaNode({
      id: 1,
      descricao: 'Roupas',
      filhas: [{ id: 2, descricao: 'Camisetas', filhas: [] }],
    })
    expect(resultado).toEqual({
      id: 1,
      descricao: 'Roupas',
      filhas: [{ id: 2, descricao: 'Camisetas', filhas: [] }],
    })
  })

  it('lança erro quando id está ausente', () => {
    expect(() => parseCategoriaNode({ descricao: 'Sem ID', filhas: [] }))
      .toThrow('campo id ausente ou invalido')
  })

  it('lança erro quando descricao está ausente', () => {
    expect(() => parseCategoriaNode({ id: 1, filhas: [] }))
      .toThrow('descricao ausente')
  })

  it('lança erro quando input não é objeto', () => {
    expect(() => parseCategoriaNode('string')).toThrow('item nao e objeto')
  })
})

describe('extrairCategoriasResposta', () => {
  it('aceita array direto', () => {
    const resultado = extrairCategoriasResposta([{ id: 1, descricao: 'A', filhas: [] }])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].id).toBe(1)
  })

  it('aceita wrapper com chave "categorias"', () => {
    const resultado = extrairCategoriasResposta({
      categorias: [{ id: 2, descricao: 'B', filhas: [] }],
    })
    expect(resultado[0].id).toBe(2)
  })

  it('aceita objeto único com id e descricao', () => {
    const resultado = extrairCategoriasResposta({ id: 3, descricao: 'C', filhas: [] })
    expect(resultado).toHaveLength(1)
    expect(resultado[0].id).toBe(3)
  })

  it('lança erro para formato desconhecido', () => {
    expect(() => extrairCategoriasResposta({ foo: 'bar' }))
      .toThrow('Formato de resposta da API de categorias nao reconhecido')
  })
})

describe('flattenCategoriasArvore', () => {
  it('planifica árvore de 3 níveis com caminho e nivel corretos', () => {
    const arvore = [{
      id: 1, descricao: 'Raiz', filhas: [{
        id: 2, descricao: 'Filho', filhas: [{
          id: 3, descricao: 'Neto', filhas: [],
        }],
      }],
    }]

    const resultado = flattenCategoriasArvore(arvore)

    expect(resultado).toHaveLength(3)

    expect(resultado[0]).toMatchObject({ id: 1, nivel: 0, caminho: 'Raiz', categoria_pai_id: null, filhas_count: 1 })
    expect(resultado[1]).toMatchObject({ id: 2, nivel: 1, caminho: 'Raiz > Filho', categoria_pai_id: 1, filhas_count: 1 })
    expect(resultado[2]).toMatchObject({ id: 3, nivel: 2, caminho: 'Raiz > Filho > Neto', categoria_pai_id: 2, filhas_count: 0 })
  })
})
```

- [ ] **Step 2: Rodar testes e confirmar que falham**

```bash
npx vitest run tests/lib/olist/categorias.test.ts
```

Esperado: erro de módulo não encontrado.

- [ ] **Step 3: Criar `src/lib/olist/categorias.ts`**

```ts
import { olistFetch } from './client'

export type CategoriaArvore = {
  id: number
  descricao: string
  filhas: CategoriaArvore[]
}

export type Categoria = {
  id: number
  descricao: string
  categoriaPai: { id: number; descricao: string } | null
  filhas: CategoriaArvore[]
}

export type CategoriaParaUpsert = {
  id: number
  descricao: string
  categoria_pai_id: number | null
  nivel: number
  caminho: string
  filhas_count: number
  sincronizado_em: string
}

export function parseCategoriaNode(rawNode: unknown): CategoriaArvore {
  if (!rawNode || typeof rawNode !== 'object') {
    throw new Error('Resposta de categoria invalida: item nao e objeto.')
  }

  const candidate = rawNode as Record<string, unknown>
  const id = Number(candidate.id)
  const descricao = String(candidate.descricao ?? '').trim()
  const filhasRaw = Array.isArray(candidate.filhas) ? candidate.filhas : []

  if (!Number.isFinite(id)) {
    throw new Error('Resposta de categoria invalida: campo id ausente ou invalido.')
  }

  if (!descricao) {
    throw new Error(`Resposta de categoria invalida: descricao ausente na categoria ${id}.`)
  }

  return {
    id,
    descricao,
    filhas: filhasRaw.map(parseCategoriaNode),
  }
}

export function extrairCategoriasResposta(payload: unknown): CategoriaArvore[] {
  if (Array.isArray(payload)) {
    return payload.map(parseCategoriaNode)
  }

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>

    for (const chave of ['categorias', 'data', 'itens', 'items']) {
      if (Array.isArray(obj[chave])) {
        return (obj[chave] as unknown[]).map(parseCategoriaNode)
      }
    }

    if ('id' in obj && 'descricao' in obj) {
      return [parseCategoriaNode(obj)]
    }
  }

  throw new Error('Formato de resposta da API de categorias nao reconhecido.')
}

export async function fetchCategoriasArvore(): Promise<CategoriaArvore[]> {
  const res = await olistFetch('/categorias/todas')
  return extrairCategoriasResposta(await res.json())
}

export async function getCategoria(id: number): Promise<Categoria> {
  const res = await olistFetch(`/categorias/${id}`)
  const json = await res.json()

  return {
    id: Number(json.id),
    descricao: String(json.descricao ?? '').trim(),
    categoriaPai: json.categoriaPai
      ? { id: Number(json.categoriaPai.id), descricao: String(json.categoriaPai.descricao) }
      : null,
    filhas: Array.isArray(json.filhas) ? json.filhas.map(parseCategoriaNode) : [],
  }
}

export function flattenCategoriasArvore(categorias: CategoriaArvore[]): CategoriaParaUpsert[] {
  const linhas: CategoriaParaUpsert[] = []
  const sincronizadoEm = new Date().toISOString()

  function visitar(
    categoria: CategoriaArvore,
    categoriaPaiId: number | null,
    caminhoPai: string[],
    nivel: number
  ) {
    const caminhoPartes = [...caminhoPai, categoria.descricao]

    linhas.push({
      id: categoria.id,
      descricao: categoria.descricao,
      categoria_pai_id: categoriaPaiId,
      nivel,
      caminho: caminhoPartes.join(' > '),
      filhas_count: categoria.filhas.length,
      sincronizado_em: sincronizadoEm,
    })

    categoria.filhas.forEach((filha) =>
      visitar(filha, categoria.id, caminhoPartes, nivel + 1)
    )
  }

  categorias.forEach((categoria) => visitar(categoria, null, [], 0))

  return linhas
}
```

- [ ] **Step 4: Rodar testes e confirmar que passam**

```bash
npx vitest run tests/lib/olist/categorias.test.ts
```

Esperado: todos os testes passando.

- [ ] **Step 5: Deletar arquivo legado**

```bash
rm src/lib/sync/olist-categorias.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/olist/categorias.ts tests/lib/olist/categorias.test.ts
git rm src/lib/sync/olist-categorias.ts
git commit -m "feat: lib/olist/categorias.ts (migrado de lib/sync), testes de parsing"
```

---

## Task 7: Rotas OAuth (login + callback)

**Files:**
- Create: `src/app/api/olist/oauth/login/route.ts`
- Create: `src/app/callback/route.ts`

- [ ] **Step 1: Criar `src/app/api/olist/oauth/login/route.ts`**

```ts
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
```

- [ ] **Step 2: Criar `src/app/callback/route.ts`**

```ts
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
```

- [ ] **Step 3: Verificar manualmente**

Suba o servidor (`npm run dev`) e acesse `http://localhost:3000/api/olist/oauth/login` no browser.

Deve redirecionar para a tela de login do Olist ERP em `accounts.tiny.com.br`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/olist/oauth/login/route.ts src/app/callback/route.ts
git commit -m "feat: rotas OAuth login e callback"
```

---

## Task 8: Rota de status + atualizar rota de sincronização

**Files:**
- Create: `src/app/api/olist/oauth/status/route.ts`
- Modify: `src/app/api/sincronizar/categorias/route.ts`

- [ ] **Step 1: Criar `src/app/api/olist/oauth/status/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getStoredTokens } from '@/lib/olist/tokens'

export async function GET() {
  const tokens = await getStoredTokens()

  if (!tokens) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({
    connected: true,
    expiresAt: tokens.expiresAt.toISOString(),
    obtainedAt: tokens.obtainedAt.toISOString(),
  })
}
```

- [ ] **Step 2: Atualizar `src/app/api/sincronizar/categorias/route.ts`**

Substitua o conteúdo completo do arquivo por:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchCategoriasArvore, flattenCategoriasArvore } from '@/lib/olist/categorias'
import { OlistAuthError, OlistApiError } from '@/lib/olist/errors'

export async function POST() {
  try {
    const supabase = await createClient()
    const categorias = await fetchCategoriasArvore()
    const categoriasUpsert = flattenCategoriasArvore(categorias)

    const { error } = await supabase.from('categorias_erp').upsert(categoriasUpsert, {
      onConflict: 'id',
    })

    if (error) throw new Error(error.message)

    return NextResponse.json({
      categorias_raiz: categorias.length,
      importadas: categoriasUpsert.length,
    })
  } catch (err) {
    if (err instanceof OlistAuthError) {
      return NextResponse.json(
        { error: 'Olist não conectado. Acesse /admin/olist para reconectar.' },
        { status: 401 }
      )
    }

    if (err instanceof OlistApiError) {
      return NextResponse.json(
        { error: `API Olist retornou ${err.status}` },
        { status: 502 }
      )
    }

    console.error('Erro na sincronizacao de categorias:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/olist/oauth/status/route.ts src/app/api/sincronizar/categorias/route.ts
git commit -m "feat: rota status OAuth e sincronizacao de categorias atualizada"
```

---

## Task 9: Página admin `/admin/olist`

**Files:**
- Create: `src/app/(dashboard)/admin/olist/page.tsx`

- [ ] **Step 1: Criar `src/app/(dashboard)/admin/olist/page.tsx`**

```tsx
import { getStoredTokens } from '@/lib/olist/tokens'
import OlistActions from './OlistActions'

type ConnectionStatus =
  | { connected: false }
  | { connected: true; expiresAt: string; obtainedAt: string }

async function getStatus(): Promise<ConnectionStatus> {
  const tokens = await getStoredTokens()
  if (!tokens) return { connected: false }
  return {
    connected: true,
    expiresAt: tokens.expiresAt.toISOString(),
    obtainedAt: tokens.obtainedAt.toISOString(),
  }
}

export default async function OlistAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const status = await getStatus()

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-semibold mb-6">Integração Olist ERP</h1>

      {error === 'csrf' && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">
          Erro de segurança na autenticação. Tente novamente.
        </div>
      )}
      {error === 'oauth_failed' && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">
          Falha na autenticação com o Olist. Tente novamente.
        </div>
      )}

      {!status.connected ? (
        <div className="p-4 bg-yellow-50 border border-yellow-300 rounded mb-4">
          <p className="font-medium text-yellow-800">Olist ERP não conectado</p>
          <p className="text-sm text-yellow-700 mt-1">Nenhum token encontrado.</p>
        </div>
      ) : (
        <div className="p-4 bg-green-50 border border-green-300 rounded mb-4">
          <p className="font-medium text-green-800">Olist ERP conectado</p>
          <p className="text-sm text-green-700 mt-1">
            Token válido até:{' '}
            {new Date(status.expiresAt).toLocaleString('pt-BR')}
          </p>
          <p className="text-sm text-green-700">
            Obtido em: {new Date(status.obtainedAt).toLocaleString('pt-BR')}
          </p>
        </div>
      )}

      <OlistActions connected={status.connected} />
    </div>
  )
}
```

- [ ] **Step 2: Criar `src/app/(dashboard)/admin/olist/OlistActions.tsx`**

```tsx
'use client'

import { useState } from 'react'

export default function OlistActions({ connected }: { connected: boolean }) {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  async function sincronizarCategorias() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sincronizar/categorias', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setSyncResult(`Erro: ${json.error}`)
      } else {
        setSyncResult(`${json.importadas} categorias importadas (${json.categorias_raiz} raízes).`)
      }
    } catch {
      setSyncResult('Erro de rede.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {connected && (
        <>
          <button
            onClick={sincronizarCategorias}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar Categorias'}
          </button>
          {syncResult && (
            <p className="text-sm text-gray-700">{syncResult}</p>
          )}
        </>
      )}

      <a
        href="/api/olist/oauth/login"
        className="px-4 py-2 bg-gray-800 text-white rounded text-center hover:bg-gray-700"
      >
        {connected ? 'Reconectar com Olist ERP' : 'Conectar com Olist ERP'}
      </a>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/admin/olist/
git commit -m "feat: página admin/olist com status de conexão e sincronização"
```

---

## Task 10: Variáveis de ambiente e teste end-to-end

**Files:**
- Modify: `.env.example`
- Modify: `.env.local`

- [ ] **Step 1: Atualizar `.env.example`**

Substitua o conteúdo de `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY

OLIST_API_BASE_URL=https://api.tiny.com.br/public-api/v3
OLIST_CLIENT_ID=SEU_CLIENT_ID
OLIST_CLIENT_SECRET=SEU_CLIENT_SECRET
OLIST_REDIRECT_URI=http://localhost:3000/callback
```

- [ ] **Step 2: Atualizar `.env.local` com os valores reais**

Edite `.env.local` e:
- Adicione `SUPABASE_SERVICE_ROLE_KEY=` (Settings → API no painel Supabase → `service_role secret`)
- Adicione `OLIST_CLIENT_ID=` (novo client_id gerado após rotação)
- Adicione `OLIST_CLIENT_SECRET=` (novo client_secret gerado após rotação)
- Adicione `OLIST_REDIRECT_URI=http://localhost:3000/callback`
- Remova a linha `OLIST_ACCESS_TOKEN=...`

- [ ] **Step 3: Rodar todos os testes**

```bash
npx vitest run
```

Esperado: todos os testes passando.

- [ ] **Step 4: Teste end-to-end do fluxo OAuth**

1. `npm run dev`
2. Acesse `http://localhost:3000/admin/olist` — deve aparecer "Olist ERP não conectado"
3. Clique "Conectar com Olist ERP" — deve redirecionar para login do Olist
4. Faça login e autorize — deve voltar para `/admin/olist` mostrando "conectado"
5. Clique "Sincronizar Categorias" — deve aparecer "X categorias importadas"
6. Verifique tabela `categorias_erp` no Supabase — deve ter linhas

- [ ] **Step 5: Commit final**

```bash
git add .env.example
git commit -m "feat: variáveis de ambiente atualizadas para integração Olist completa"
```

---

## Resumo da ordem de execução

```
Task 1  → migration SQL (precisa ser rodada manualmente no Supabase)
Task 2  → config + errors (sem dependências)
Task 3  → service client + tokens (depende de Task 2)
Task 4  → auth OAuth (depende de Tasks 2 e 3)
Task 5  → olistFetch (depende de Tasks 2, 3 e 4) — TDD
Task 6  → categorias (depende de Task 5) — TDD
Task 7  → rotas OAuth login + callback (depende de Tasks 3 e 4)
Task 8  → status route + atualizar sincronização (depende de Tasks 5 e 6)
Task 9  → página admin (depende de Tasks 3, 7 e 8)
Task 10 → env vars + teste end-to-end (depende de tudo)
```
