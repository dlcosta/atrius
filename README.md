# Atrius Planner

Dashboard de acompanhamento da producao com foco em planejamento por maquina (estilo calendario), incluindo fluxo em duas etapas:

1. Tanque (ordens em litros, ex.: TQ0001)
2. Envase/conversao (ordens em FD/UN/CX etc.)

Tambem inclui:
- controle operacional por ordem (iniciar/finalizar)
- previsao de termino recalculada a partir do inicio real
- painel de monitoramento com indicadores de producao

## Stack

- Next.js (App Router)
- Supabase (PostgreSQL + Realtime)
- Tailwind CSS
- Vitest

## Rodando localmente

```bash
npm install
npm run dev
```

## Migracoes do banco (obrigatorio)

Execute no Supabase SQL Editor, nesta ordem:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_dashboard_producao.sql`
3. `supabase/migrations/003_operacao_acompanhamento.sql`
4. `supabase/migrations/004_categorias_erp.sql`
5. `supabase/migrations/005_olist_oauth_tokens.sql`
6. `supabase/migrations/006_produtos_erp.sql`
7. `supabase/migrations/007_producao_erp.sql`
8. `supabase/migrations/008_pedidos_erp.sql`
9. `supabase/migrations/009_pedidos_erp_itens.sql`

A migration `002` e idempotente e corrige ambientes com schema parcial (incluindo erro de `tempos_maquinas`).

## Variaveis de ambiente

Crie `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
API_EXTERNA_URL=...
API_EXTERNA_KEY=...
OLIST_API_BASE_URL=https://api.tiny.com.br/public-api/v3
OLIST_ACCESS_TOKEN=...
```

## Sincronizacao de categorias (Olist ERP API v3)

Endpoint interno:

`POST /api/sincronizar/categorias`

Fluxo esperado:

1. Obter `access_token` OAuth2 da Olist/Tiny
2. Configurar `OLIST_ACCESS_TOKEN` no `.env.local`
3. Chamar o endpoint acima para importar a arvore de categorias na tabela `categorias_erp`

## Scripts

```bash
npm run dev
npm run build
npm run test
```
