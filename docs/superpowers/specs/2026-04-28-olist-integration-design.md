# Design: Integração Olist ERP

**Data:** 2026-04-28
**Projeto:** atrius-planner
**Escopo:** Cliente Olist genérico com OAuth 2.0 + refresh automático, sincronização de categorias, base para produtos/pedidos.

---

## Decisões de design

| Decisão | Escolha |
|---|---|
| Escopo | Cliente Olist genérico (`lib/olist/`) reutilizável |
| Armazenamento de tokens | Tabela Supabase `olist_oauth_tokens` |
| Acesso ao Supabase para tokens | Service role key (bypassa RLS) |
| UI de login OAuth | Página `/admin/olist` com botão "Conectar" |
| Arquivo legado `lib/sync/olist-categorias.ts` | Deletado — migrado para `lib/olist/categorias.ts` |
| Organização interna de `lib/olist/` | Separação por responsabilidade (6 arquivos) |

---

## Visão geral

O sistema expõe um cliente HTTP (`olistFetch`) que garante automaticamente um access token válido antes de cada chamada à API do Olist ERP. Quem consome a API (categorias, futuros produtos/pedidos) não precisa saber que existe OAuth — só chama `olistFetch('/categorias/todas')`.

**Fluxo em três tempos:**

1. **Conexão inicial** (manual, uma vez): usuário acessa `/admin/olist`, clica "Conectar com Olist", autoriza no Olist ERP, volta no `/callback`, sistema salva `access_token` + `refresh_token` no Supabase.
2. **Renovação automática**: `olistFetch()` verifica `expires_at`. Se expirado, renova com `refresh_token` antes de chamar a API, salva os novos tokens.
3. **Sincronização**: `POST /api/sincronizar/categorias` chama `fetchCategoriasArvore()` e faz upsert em `categorias_erp`. Funciona a qualquer hora sem intervenção manual.

---

## URLs da API

| Recurso | Método | URL |
|---|---|---|
| Autorização OAuth | GET (browser) | `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth` |
| Token (troca + refresh) | POST | `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token` |
| Listar árvore de categorias | GET | `https://api.tiny.com.br/public-api/v3/categorias/todas` |
| Obter categoria por id | GET | `https://api.tiny.com.br/public-api/v3/categorias/{idCategoria}` |

---

## Arquivos

### Novos

```
supabase/migrations/005_olist_oauth_tokens.sql
src/lib/olist/config.ts
src/lib/olist/errors.ts
src/lib/olist/tokens.ts
src/lib/olist/auth.ts
src/lib/olist/client.ts
src/lib/olist/categorias.ts
src/lib/supabase/service.ts
src/app/api/olist/oauth/login/route.ts
src/app/api/olist/oauth/status/route.ts
src/app/callback/route.ts
src/app/(dashboard)/admin/olist/page.tsx
tests/lib/olist/categorias.test.ts
tests/lib/olist/client.test.ts
```

### Modificados

```
.env.example                                          → OLIST_CLIENT_ID, OLIST_CLIENT_SECRET, OLIST_REDIRECT_URI, SUPABASE_SERVICE_ROLE_KEY
.env.local                                            → mesmos campos com valores reais
src/app/api/sincronizar/categorias/route.ts           → import de @/lib/olist/categorias; OlistAuthError → 401
```

### Deletados

```
src/lib/sync/olist-categorias.ts
```

---

## Contratos dos módulos

### `lib/olist/config.ts`

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

### `lib/olist/errors.ts`

```ts
export class OlistAuthError extends Error {
  code: 'not_connected' | 'refresh_failed' | 'unauthorized'
}
export class OlistApiError extends Error {
  status: number
  body: string
}
```

### `lib/olist/tokens.ts`

```ts
export type StoredTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  obtainedAt: Date
}
export async function getStoredTokens(): Promise<StoredTokens | null>
export async function saveTokens(t: StoredTokens): Promise<void>
```

- Usa `createServiceClient()` (service role, bypassa RLS).
- Tabela `olist_oauth_tokens` tem 1 linha (id = 1, constraint `id = 1`).
- `saveTokens` faz upsert por id.

### `lib/olist/auth.ts`

```ts
export function buildAuthUrl(state: string): string
export async function exchangeCode(code: string): Promise<StoredTokens>
export async function refreshTokens(refreshToken: string): Promise<StoredTokens>
```

- `expiresAt = now + expires_in - 60` (margem de 60s).
- `invalid_grant` no refresh → `OlistAuthError('refresh_failed')`.

### `lib/olist/client.ts`

```ts
export async function olistFetch(path: string, init?: RequestInit): Promise<Response>
```

Lógica interna:
1. `getStoredTokens()` → null → `OlistAuthError('not_connected')`.
2. `expiresAt <= now` → `refreshTokens()` + `saveTokens()`.
3. `fetch(apiBaseUrl + path, { Authorization: Bearer ... })`.
4. 401 → refresh + retry. 401 de novo → `OlistAuthError('unauthorized')`.
5. Outros erros HTTP → `OlistApiError(status, body)`.

### `lib/olist/categorias.ts`

```ts
// Tipos
export type CategoriaArvore = { id: number; descricao: string; filhas: CategoriaArvore[] }
export type Categoria = { id: number; descricao: string; categoriaPai: { id: number; descricao: string } | null; filhas: CategoriaArvore[] }
export type CategoriaParaUpsert = { id: number; descricao: string; categoria_pai_id: number | null; nivel: number; caminho: string; filhas_count: number; sincronizado_em: string }

// Funções públicas
export async function fetchCategoriasArvore(): Promise<CategoriaArvore[]>
export async function getCategoria(id: number): Promise<Categoria>
export function flattenCategoriasArvore(c: CategoriaArvore[]): CategoriaParaUpsert[]

// Funções internas (exportadas para teste)
export function parseCategoriaNode(raw: unknown): CategoriaArvore
export function extrairCategoriasResposta(payload: unknown): CategoriaArvore[]
```

- `fetchCategoriasArvore` usa `GET /categorias/todas` (endpoint canônico confirmado na doc).
- Sem fallback `/categorias/arvore` (não documentado oficialmente).
- Lógica de parsing e flatten idêntica ao `olist-categorias.ts` atual — só movida.

### `lib/supabase/service.ts`

```ts
export function createServiceClient(): SupabaseClient
// Usa SUPABASE_SERVICE_ROLE_KEY, sem cookies, sem SSR.
// Uso restrito: tokens.ts. Não usar em outros módulos.
```

---

## Migration `005_olist_oauth_tokens.sql`

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

---

## Fluxo OAuth completo

```
1. GET /api/olist/oauth/login
   - gera state = crypto.randomUUID()
   - salva state em cookie httpOnly, SameSite=Lax, MaxAge=60s
   - redirect para authUrl com client_id, redirect_uri, scope, response_type=code, state

2. GET /callback?code=XYZ&state=ABC
   - valida state vs cookie (CSRF)
   - POST tokenUrl: grant_type=authorization_code, code, client_id, client_secret, redirect_uri
   - saveTokens(tokens)
   - redirect('/admin/olist')
   - erros → redirect('/admin/olist?error=oauth_failed' ou '?error=csrf')

3. olistFetch() — uso normal (transparente)
   - getStoredTokens()
   - expirado → refreshTokens() + saveTokens()
   - fetch com Bearer token
   - 401 → refresh + retry
```

**Nota:** `redirect_uri` cadastrado no Olist é `http://localhost:3000/callback`, portanto a rota é `src/app/callback/route.ts` (raiz do app, não dentro de `/api/`).

---

## UI `/admin/olist`

Server Component. Chama `GET /api/olist/oauth/status` para determinar estado.

**Estado A — Não conectado:**
- Banner amarelo: "Olist ERP não conectado"
- Botão: "Conectar com Olist ERP" → `GET /api/olist/oauth/login`

**Estado B — Conectado, token válido:**
- Banner verde: "Olist ERP conectado"
- Info: token válido até X, última sincronização em Y
- Botão: "Sincronizar Categorias" (Client Component, POST + feedback)
- Botão secundário: "Reconectar"

**Estado C — Refresh falhou:**
- Banner vermelho: "Token expirado — reautorização necessária"
- Botão: "Reconectar com Olist ERP"

**Erros OAuth** (`?error=` na URL):
- Banner acima dos botões com mensagem traduzida.

---

## Error handling

| Onde ocorre | Erro | Resultado |
|---|---|---|
| `olistFetch` | Token null | `OlistAuthError('not_connected')` |
| `olistFetch` | 401 após retry | `OlistAuthError('unauthorized')` |
| `olistFetch` | refresh falha | `OlistAuthError('refresh_failed')` |
| `olistFetch` | 4xx/5xx da API | `OlistApiError(status, body)` |
| `route.ts` sincronizar/categorias | `OlistAuthError` | HTTP 401 + `{ error: 'Reconecte em /admin/olist' }` |
| `route.ts` sincronizar/categorias | `OlistApiError` | HTTP 502 + `{ error: 'API Olist retornou {status}' }` |
| `callback/route.ts` | state inválido | redirect `/admin/olist?error=csrf` |
| `callback/route.ts` | code inválido | redirect `/admin/olist?error=oauth_failed` |
| `/admin/olist` page | `?error=` na URL | banner de erro acima dos botões |

---

## Testes

**`tests/lib/olist/categorias.test.ts`**
- `parseCategoriaNode`: entrada válida, sem `id`, sem `descricao`, filhas recursivas
- `extrairCategoriasResposta`: array direto, wrapper `{categorias:[...]}`, objeto único, formato desconhecido
- `flattenCategoriasArvore`: árvore de 3 níveis → lista plana com `caminho` e `nivel` corretos

**`tests/lib/olist/client.test.ts`** (mock de `tokens.ts` e `fetch` global)
- Token válido → fetch chamado uma vez, sem refresh
- Token expirado → `refreshTokens` chamado, tokens salvos, fetch chamado com novo token
- 401 → refresh + retry → sucesso
- 401 → refresh + retry → 401 de novo → `OlistAuthError('unauthorized')`
- `getStoredTokens` null → `OlistAuthError('not_connected')`

---

## Variáveis de ambiente necessárias

```
# Já existia
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OLIST_API_BASE_URL=https://api.tiny.com.br/public-api/v3

# Novas
OLIST_CLIENT_ID=
OLIST_CLIENT_SECRET=
OLIST_REDIRECT_URI=http://localhost:3000/callback
SUPABASE_SERVICE_ROLE_KEY=

# Remover (não vai mais existir solto)
# OLIST_ACCESS_TOKEN  ← deletar do .env.local
```
