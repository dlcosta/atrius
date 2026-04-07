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

A migration `002` e idempotente e corrige ambientes com schema parcial (incluindo erro de `tempos_maquinas`).

## Variaveis de ambiente

Crie `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
API_EXTERNA_URL=...
API_EXTERNA_KEY=...
```

## Scripts

```bash
npm run dev
npm run build
npm run test
```
