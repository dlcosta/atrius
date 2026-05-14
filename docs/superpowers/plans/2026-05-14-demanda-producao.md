# Demanda de Produção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a página `/demanda` que agrupa pedidos ERP por data e categoria, permite selecionar itens até o limite de um tanque, e cria ordens de produção em BACKLOG.

**Architecture:** Server component carrega dados iniciais via Supabase RPC. Client components gerenciam o estado de seleção local (accordion, checkboxes, barra de progresso). API route `POST /api/demanda/ordens` cria a ordem na tabela `ordens` e os vínculos em `ordens_pedidos_erp` em sequência. A página `/demanda` fica dentro do layout `(dashboard)` existente.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (server client), Tailwind CSS 4, Lucide React

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260514150000_ordens_pedidos_erp.sql` | Criar | Tabela `ordens_pedidos_erp` e índices |
| `src/types/index.ts` | Modificar | Adicionar tipos `ItemDemanda`, `OrdemPedidoErp` |
| `src/app/api/demanda/route.ts` | Criar | `GET /api/demanda` — busca itens pendentes via Supabase |
| `src/app/api/demanda/ordens/route.ts` | Criar | `POST /api/demanda/ordens` — cria ordem + vínculos |
| `src/app/(dashboard)/demanda/page.tsx` | Criar | Server component + orquestração da página |
| `src/components/demanda/DemandaList.tsx` | Criar | Accordion por data → categoria |
| `src/components/demanda/CategoriaAccordion.tsx` | Criar | Expansão de grupo, dropdown tanque, barra %, botão criar |
| `src/components/demanda/ItemPedidoRow.tsx` | Criar | Linha com checkbox, pedido, litros |
| `src/components/demanda/TanqueProgressBar.tsx` | Criar | Barra de progresso com % e litros |
| `src/components/ui/Sidebar.tsx` | Modificar | Adicionar item "Demanda" no nav |

---

## Task 1: Migração — Tabela `ordens_pedidos_erp`

**Files:**
- Create: `supabase/migrations/20260514150000_ordens_pedidos_erp.sql`

- [ ] **Step 1: Criar o arquivo de migração**

```sql
-- supabase/migrations/20260514150000_ordens_pedidos_erp.sql

create table if not exists public.ordens_pedidos_erp (
  id                uuid primary key default gen_random_uuid(),
  ordem_id          uuid not null references public.ordens(id) on delete cascade,
  numero_pedido     text not null,
  produto_descricao text not null,
  quantidade        numeric not null,
  total_litros      numeric not null,
  criado_em         timestamptz not null default now()
);

create index if not exists ordens_pedidos_erp_numero_pedido_idx
  on public.ordens_pedidos_erp (numero_pedido);

create index if not exists ordens_pedidos_erp_ordem_id_idx
  on public.ordens_pedidos_erp (ordem_id);
```

- [ ] **Step 2: Aplicar a migração no Supabase local (se usar Supabase CLI)**

```bash
npx supabase db push
```

Se não usar CLI local, execute o SQL diretamente no painel Supabase → SQL Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260514150000_ordens_pedidos_erp.sql
git commit -m "feat: migration ordens_pedidos_erp"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Adicionar os tipos ao final do arquivo `src/types/index.ts`**

```typescript
export type ItemDemanda = {
  data_prevista: string
  categoria_produto: string
  produto_descricao: string
  numero_pedido: string
  cliente_nome: string
  quantidade: number
  litros_por_unidade: number
  unidades_por_embalagem: number
  total_litros: number
  alocado?: boolean
  ordem_id?: string | null
  ordem_status?: string | null
}

export type OrdemPedidoErp = {
  id: string
  ordem_id: string
  numero_pedido: string
  produto_descricao: string
  quantidade: number
  total_litros: number
  criado_em: string
}
```

- [ ] **Step 2: Verificar que o TypeScript não reclama**

```bash
npx tsc --noEmit
```

Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: tipos ItemDemanda e OrdemPedidoErp"
```

---

## Task 3: API `GET /api/demanda`

**Files:**
- Create: `src/app/api/demanda/route.ts`

- [ ] **Step 1: Criar o arquivo de rota**

```typescript
// src/app/api/demanda/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ItemDemanda } from '@/types'

const DEMANDA_QUERY = `
  WITH base AS (
    SELECT
      data_prevista,
      produto_descricao,
      numero_pedido,
      cliente_nome,
      quantidade,
      TRIM(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              produto_descricao,
              '[[:space:]]+[0-9]+[[:space:]]*(ML|L|LT|LTS|KG|G)([[:space:]]|$)',
              ' ', 'gi'
            ),
            '[[:space:]]*-[[:space:]]*(CX|FD)[[:space:]].*',
            '', 'gi'
          ),
          '[[:space:]]+', ' ', 'g'
        )
      ) AS categoria_produto,
      CASE
        WHEN produto_descricao ~* '500[[:space:]]*ML' THEN 0.5
        WHEN produto_descricao ~* '[[:space:]]1[[:space:]]*(L|LT|LTS)' THEN 1
        WHEN produto_descricao ~* '[[:space:]]2[[:space:]]*(L|LT|LTS)' THEN 2
        WHEN produto_descricao ~* '[[:space:]]5[[:space:]]*(L|LT|LTS)' THEN 5
        ELSE 0
      END AS litros_por_unidade,
      CASE
        WHEN produto_descricao ~* 'C/[[:space:]]*24[[:space:]]*UN' THEN 24
        WHEN produto_descricao ~* 'C/[[:space:]]*12[[:space:]]*UN' THEN 12
        WHEN produto_descricao ~* 'C/[[:space:]]*6[[:space:]]*UN'  THEN 6
        WHEN produto_descricao ~* 'C/[[:space:]]*4[[:space:]]*UN'  THEN 4
        ELSE 1
      END AS unidades_por_embalagem
    FROM public.v_pedidos_erp_com_itens
  )
  SELECT
    data_prevista,
    categoria_produto,
    produto_descricao,
    numero_pedido,
    cliente_nome,
    SUM(quantidade)::numeric AS quantidade,
    MAX(litros_por_unidade)::numeric AS litros_por_unidade,
    MAX(unidades_por_embalagem)::numeric AS unidades_por_embalagem,
    SUM(quantidade * litros_por_unidade * unidades_por_embalagem)::numeric AS total_litros
  FROM base
  GROUP BY
    data_prevista, categoria_produto, produto_descricao, numero_pedido, cliente_nome
  ORDER BY
    data_prevista, categoria_produto, produto_descricao
`

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const mostrarAlocados = searchParams.get('mostrar_alocados') === 'true'

  const { data: rows, error } = await supabase.rpc('demanda_itens_pendentes', {
    p_mostrar_alocados: mostrarAlocados,
  })

  if (error) {
    // fallback: raw query via from() não suporta SQL arbitrário — retornar erro útil
    return NextResponse.json(
      { error: `Erro ao buscar demanda: ${error.message}. Verifique se a função demanda_itens_pendentes existe no Supabase.` },
      { status: 500 }
    )
  }

  return NextResponse.json(rows as ItemDemanda[])
}
```

> **Nota:** Esta rota depende de uma função RPC `demanda_itens_pendentes` criada na Task 4.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/demanda/route.ts
git commit -m "feat: GET /api/demanda (requer função RPC no supabase)"
```

---

## Task 4: Função RPC Supabase `demanda_itens_pendentes`

**Files:**
- Create: `supabase/migrations/20260514160000_demanda_rpc.sql`

Esta função executa a query de demanda e filtra os itens já alocados consultando `ordens_pedidos_erp`.

- [ ] **Step 1: Criar o arquivo de migração da função**

```sql
-- supabase/migrations/20260514160000_demanda_rpc.sql

create or replace function public.demanda_itens_pendentes(
  p_mostrar_alocados boolean default false
)
returns table (
  data_prevista       timestamptz,
  categoria_produto   text,
  produto_descricao   text,
  numero_pedido       text,
  cliente_nome        text,
  quantidade          numeric,
  litros_por_unidade  numeric,
  unidades_por_embalagem numeric,
  total_litros        numeric,
  alocado             boolean,
  ordem_id            uuid,
  ordem_status        text
)
language sql
stable
as $$
  with base as (
    select
      v.data_prevista,
      v.produto_descricao,
      v.numero_pedido,
      v.cliente_nome,
      v.quantidade,
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              v.produto_descricao,
              '[[:space:]]+[0-9]+[[:space:]]*(ML|L|LT|LTS|KG|G)([[:space:]]|$)',
              ' ', 'gi'
            ),
            '[[:space:]]*-[[:space:]]*(CX|FD)[[:space:]].*',
            '', 'gi'
          ),
          '[[:space:]]+', ' ', 'g'
        )
      ) as categoria_produto,
      case
        when v.produto_descricao ~* '500[[:space:]]*ML' then 0.5
        when v.produto_descricao ~* '[[:space:]]1[[:space:]]*(L|LT|LTS)' then 1
        when v.produto_descricao ~* '[[:space:]]2[[:space:]]*(L|LT|LTS)' then 2
        when v.produto_descricao ~* '[[:space:]]5[[:space:]]*(L|LT|LTS)' then 5
        else 0
      end as litros_por_unidade,
      case
        when v.produto_descricao ~* 'C/[[:space:]]*24[[:space:]]*UN' then 24
        when v.produto_descricao ~* 'C/[[:space:]]*12[[:space:]]*UN' then 12
        when v.produto_descricao ~* 'C/[[:space:]]*6[[:space:]]*UN'  then 6
        when v.produto_descricao ~* 'C/[[:space:]]*4[[:space:]]*UN'  then 4
        else 1
      end as unidades_por_embalagem
    from public.v_pedidos_erp_com_itens v
  ),
  agrupado as (
    select
      data_prevista,
      categoria_produto,
      produto_descricao,
      numero_pedido,
      cliente_nome,
      sum(quantidade)::numeric as quantidade,
      max(litros_por_unidade)::numeric as litros_por_unidade,
      max(unidades_por_embalagem)::numeric as unidades_por_embalagem,
      sum(quantidade * litros_por_unidade * unidades_por_embalagem)::numeric as total_litros
    from base
    group by
      data_prevista, categoria_produto, produto_descricao, numero_pedido, cliente_nome
  ),
  com_alocacao as (
    select
      a.*,
      ope.ordem_id,
      o.planning_status as ordem_status,
      (ope.ordem_id is not null) as alocado
    from agrupado a
    left join public.ordens_pedidos_erp ope
      on ope.numero_pedido = a.numero_pedido
      and ope.produto_descricao = a.produto_descricao
    left join public.ordens o on o.id = ope.ordem_id
  )
  select
    data_prevista,
    categoria_produto,
    produto_descricao,
    numero_pedido,
    cliente_nome,
    quantidade,
    litros_por_unidade,
    unidades_por_embalagem,
    total_litros,
    coalesce(alocado, false) as alocado,
    ordem_id,
    ordem_status
  from com_alocacao
  where p_mostrar_alocados = true or coalesce(alocado, false) = false
  order by data_prevista, categoria_produto, produto_descricao
$$;
```

- [ ] **Step 2: Aplicar a migração**

```bash
npx supabase db push
```

Ou execute o SQL diretamente no painel Supabase → SQL Editor.

- [ ] **Step 3: Testar a função no SQL Editor do Supabase**

```sql
select * from demanda_itens_pendentes(false) limit 10;
```

Expected: retorna linhas com `alocado = false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260514160000_demanda_rpc.sql
git commit -m "feat: função RPC demanda_itens_pendentes"
```

---

## Task 5: API `POST /api/demanda/ordens`

**Files:**
- Create: `src/app/api/demanda/ordens/route.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/api/demanda/ordens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ItemBody = {
  numero_pedido: string
  produto_descricao: string
  quantidade: number
  total_litros: number
}

type PostBody = {
  categoria_produto: string
  data_prevista: string
  tank_id: string
  total_litros: number
  itens: ItemBody[]
}

function validar(body: Partial<PostBody>): string | null {
  if (!body.categoria_produto?.trim()) return 'categoria_produto obrigatória'
  if (!body.data_prevista?.trim()) return 'data_prevista obrigatória'
  if (!body.tank_id?.trim()) return 'tank_id obrigatório'
  if (!body.total_litros || body.total_litros <= 0) return 'total_litros deve ser maior que zero'
  if (!Array.isArray(body.itens) || body.itens.length === 0) return 'itens não pode ser vazio'
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body: Partial<PostBody> = await req.json()

  const erroValidacao = validar(body)
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 422 })

  const { categoria_produto, data_prevista, tank_id, total_litros, itens } = body as PostBody

  // Buscar volume do tanque para registrar
  const { data: tanque, error: tanqueError } = await supabase
    .from('tanques')
    .select('volume_liters')
    .eq('id', tank_id)
    .maybeSingle()

  if (tanqueError || !tanque) {
    return NextResponse.json({ error: 'Tanque não encontrado' }, { status: 404 })
  }

  if (total_litros > tanque.volume_liters) {
    return NextResponse.json(
      { error: `Volume ${total_litros}L ultrapassa a capacidade do tanque (${tanque.volume_liters}L)` },
      { status: 422 }
    )
  }

  // Criar ordem com status BACKLOG
  const { data: ordem, error: ordemError } = await supabase
    .from('ordens')
    .insert({
      numero_externo: `DEM-${Date.now()}`,
      produto_sku: null,
      quantidade: total_litros,
      unidade: 'L',
      etapa: 'tanque',
      status: 'aguardando',
      planning_status: 'BACKLOG',
      calc_mode: 'LITERS_MASTER',
      tank_id,
      tank_volume_liters: tanque.volume_liters,
      data_prevista,
      tanque: categoria_produto,
    })
    .select('*')
    .single()

  if (ordemError || !ordem) {
    return NextResponse.json({ error: `Erro ao criar ordem: ${ordemError?.message}` }, { status: 500 })
  }

  // Inserir vínculos com os pedidos ERP
  const vinculos = itens.map((item) => ({
    ordem_id: ordem.id,
    numero_pedido: item.numero_pedido,
    produto_descricao: item.produto_descricao,
    quantidade: item.quantidade,
    total_litros: item.total_litros,
  }))

  const { error: vinculosError } = await supabase.from('ordens_pedidos_erp').insert(vinculos)

  if (vinculosError) {
    // Rollback manual: deletar a ordem criada
    await supabase.from('ordens').delete().eq('id', ordem.id)
    return NextResponse.json({ error: `Erro ao vincular pedidos: ${vinculosError.message}` }, { status: 500 })
  }

  return NextResponse.json(ordem, { status: 201 })
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/demanda/ordens/route.ts
git commit -m "feat: POST /api/demanda/ordens"
```

---

## Task 6: Componente `TanqueProgressBar`

**Files:**
- Create: `src/components/demanda/TanqueProgressBar.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/components/demanda/TanqueProgressBar.tsx
'use client'

type Props = {
  litrosSelecionados: number
  capacidadeTanque: number
}

export function TanqueProgressBar({ litrosSelecionados, capacidadeTanque }: Props) {
  const pct = capacidadeTanque > 0
    ? Math.min(100, (litrosSelecionados / capacidadeTanque) * 100)
    : 0

  const cheio = pct >= 100

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${cheio ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${cheio ? 'text-red-600' : 'text-slate-700'}`}>
        {pct.toFixed(0)}% ({litrosSelecionados.toLocaleString('pt-BR')}L / {capacidadeTanque.toLocaleString('pt-BR')}L)
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/demanda/TanqueProgressBar.tsx
git commit -m "feat: componente TanqueProgressBar"
```

---

## Task 7: Componente `ItemPedidoRow`

**Files:**
- Create: `src/components/demanda/ItemPedidoRow.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/components/demanda/ItemPedidoRow.tsx
'use client'

import type { ItemDemanda } from '@/types'

type Props = {
  item: ItemDemanda
  selecionado: boolean
  bloqueado: boolean
  onChange: (item: ItemDemanda, checked: boolean) => void
}

export function ItemPedidoRow({ item, selecionado, bloqueado, onChange }: Props) {
  const desabilitado = bloqueado && !selecionado

  return (
    <label
      className={`flex items-start gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors ${
        item.alocado
          ? 'opacity-50 bg-slate-50'
          : selecionado
          ? 'bg-blue-50 border border-blue-200'
          : desabilitado
          ? 'opacity-40 cursor-not-allowed bg-slate-50'
          : 'hover:bg-slate-50 border border-transparent'
      }`}
      title={desabilitado ? 'Tanque cheio — crie esta ordem antes de continuar' : undefined}
    >
      <input
        type="checkbox"
        checked={selecionado}
        disabled={desabilitado || !!item.alocado}
        onChange={(e) => onChange(item, e.target.checked)}
        className="mt-0.5 accent-blue-600"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800 truncate">
            Pedido {item.numero_pedido} — {item.cliente_nome}
          </span>
          <span className="text-sm font-bold text-slate-600 tabular-nums shrink-0">
            {item.total_litros.toLocaleString('pt-BR')}L
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">{item.produto_descricao}</p>
        {item.alocado && (
          <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            {item.ordem_status ?? 'alocado'}
          </span>
        )}
      </div>
    </label>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/demanda/ItemPedidoRow.tsx
git commit -m "feat: componente ItemPedidoRow"
```

---

## Task 8: Componente `CategoriaAccordion`

**Files:**
- Create: `src/components/demanda/CategoriaAccordion.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/components/demanda/CategoriaAccordion.tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { ItemDemanda, Tanque } from '@/types'
import { TanqueProgressBar } from './TanqueProgressBar'
import { ItemPedidoRow } from './ItemPedidoRow'

type Props = {
  categoria: string
  itens: ItemDemanda[]
  tanques: Tanque[]
  expandido: boolean
  onToggle: () => void
  onOrdemCriada: () => void
}

export function CategoriaAccordion({
  categoria,
  itens,
  tanques,
  expandido,
  onToggle,
  onOrdemCriada,
}: Props) {
  const [tanqueId, setTanqueId] = useState<string>(tanques[0]?.id ?? '')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const tanqueSelecionado = tanques.find((t) => t.id === tanqueId)
  const capacidade = tanqueSelecionado?.volume_liters ?? 0

  const litrosSelecionados = itens
    .filter((item) => selecionados.has(itemKey(item)))
    .reduce((acc, item) => acc + item.total_litros, 0)

  const cheio = capacidade > 0 && litrosSelecionados >= capacidade

  function itemKey(item: ItemDemanda) {
    return `${item.numero_pedido}::${item.produto_descricao}`
  }

  function handleChange(item: ItemDemanda, checked: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (checked) next.add(itemKey(item))
      else next.delete(itemKey(item))
      return next
    })
  }

  async function handleCriarOrdem() {
    if (selecionados.size === 0 || !tanqueId) return
    const itensSelecionados = itens.filter((item) => selecionados.has(itemKey(item)))
    const dataPrevista = itensSelecionados[0]?.data_prevista ?? ''

    setCriando(true)
    setErro(null)

    try {
      const res = await fetch('/api/demanda/ordens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria_produto: categoria,
          data_prevista: dataPrevista,
          tank_id: tanqueId,
          total_litros: litrosSelecionados,
          itens: itensSelecionados.map((item) => ({
            numero_pedido: item.numero_pedido,
            produto_descricao: item.produto_descricao,
            quantidade: item.quantidade,
            total_litros: item.total_litros,
          })),
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        setErro(json.error ?? 'Erro ao criar ordem')
        return
      }

      setSelecionados(new Set())
      onOrdemCriada()
    } catch {
      setErro('Erro de rede ao criar ordem')
    } finally {
      setCriando(false)
    }
  }

  const totalPendente = itens
    .filter((item) => !item.alocado)
    .reduce((acc, item) => acc + item.total_litros, 0)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {expandido ? (
            <ChevronDown size={16} className="text-slate-400" />
          ) : (
            <ChevronRight size={16} className="text-slate-400" />
          )}
          <span className="text-sm font-semibold text-slate-800">{categoria}</span>
        </div>
        <span className="text-xs text-slate-500 font-medium">
          {totalPendente.toLocaleString('pt-BR')}L pendentes
        </span>
      </button>

      {/* Corpo expandido */}
      {expandido && (
        <div className="border-t border-slate-200 bg-white">
          {/* Controles de tanque e progresso */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 space-y-2">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-600 shrink-0">Tanque:</label>
              <select
                value={tanqueId}
                onChange={(e) => {
                  setTanqueId(e.target.value)
                  setSelecionados(new Set())
                }}
                className="text-sm border border-slate-300 rounded-md px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {tanques.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.volume_liters.toLocaleString('pt-BR')}L)
                  </option>
                ))}
              </select>
            </div>
            <TanqueProgressBar
              litrosSelecionados={litrosSelecionados}
              capacidadeTanque={capacidade}
            />
          </div>

          {/* Lista de itens */}
          <div className="divide-y divide-slate-100 px-2 py-1">
            {itens.map((item) => (
              <ItemPedidoRow
                key={itemKey(item)}
                item={item}
                selecionado={selecionados.has(itemKey(item))}
                bloqueado={cheio}
                onChange={handleChange}
              />
            ))}
          </div>

          {/* Erro */}
          {erro && (
            <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {erro}
            </div>
          )}

          {/* Botão criar */}
          {selecionados.size > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleCriarOrdem}
                disabled={criando}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Plus size={16} />
                {criando
                  ? 'Criando...'
                  : `Criar Ordem de Produção — ${litrosSelecionados.toLocaleString('pt-BR')}L`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/demanda/CategoriaAccordion.tsx
git commit -m "feat: componente CategoriaAccordion"
```

---

## Task 9: Componente `DemandaList`

**Files:**
- Create: `src/components/demanda/DemandaList.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// src/components/demanda/DemandaList.tsx
'use client'

import { useState, useCallback, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calendar } from 'lucide-react'
import type { ItemDemanda, Tanque } from '@/types'
import { CategoriaAccordion } from './CategoriaAccordion'

type Props = {
  itensIniciais: ItemDemanda[]
  tanques: Tanque[]
}

type GrupoData = {
  data: string
  categorias: GrupoCategoria[]
}

type GrupoCategoria = {
  categoria: string
  itens: ItemDemanda[]
}

function agrupar(itens: ItemDemanda[]): GrupoData[] {
  const porData = new Map<string, Map<string, ItemDemanda[]>>()

  for (const item of itens) {
    const dataKey = item.data_prevista?.slice(0, 10) ?? 'sem-data'
    if (!porData.has(dataKey)) porData.set(dataKey, new Map())
    const porCategoria = porData.get(dataKey)!
    if (!porCategoria.has(item.categoria_produto)) porCategoria.set(item.categoria_produto, [])
    porCategoria.get(item.categoria_produto)!.push(item)
  }

  return Array.from(porData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, categorias]) => ({
      data,
      categorias: Array.from(categorias.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([categoria, itens]) => ({ categoria, itens })),
    }))
}

function formatarData(dataIso: string): string {
  try {
    return format(parseISO(dataIso), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  } catch {
    return dataIso
  }
}

export function DemandaList({ itensIniciais, tanques }: Props) {
  const [itens, setItens] = useState<ItemDemanda[]>(itensIniciais)
  const [mostrarAlocados, setMostrarAlocados] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await fetch(`/api/demanda${mostrarAlocados ? '?mostrar_alocados=true' : ''}`)
      if (res.ok) {
        const dados = await res.json()
        setItens(dados)
      }
    } finally {
      setCarregando(false)
    }
  }, [mostrarAlocados])

  const itensFiltrados = useMemo(
    () => (mostrarAlocados ? itens : itens.filter((i) => !i.alocado)),
    [itens, mostrarAlocados]
  )

  const grupos = useMemo(() => agrupar(itensFiltrados), [itensFiltrados])

  function toggleExpandido(key: string) {
    setExpandido((prev) => (prev === key ? null : key))
  }

  if (grupos.length === 0 && !carregando) {
    return (
      <div className="text-center py-16 text-slate-400">
        <Calendar size={40} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">Nenhum item pendente de produção</p>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">Demanda de Produção</h1>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={mostrarAlocados}
            onChange={(e) => setMostrarAlocados(e.target.checked)}
            className="accent-blue-600"
          />
          <span className="text-sm text-slate-600 select-none">Mostrar alocados</span>
        </label>
      </div>

      {carregando && (
        <div className="text-center py-4 text-sm text-slate-400">Atualizando...</div>
      )}

      {/* Grupos por data */}
      <div className="space-y-8">
        {grupos.map((grupo) => (
          <div key={grupo.data}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-slate-400" />
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                {formatarData(grupo.data)}
              </h2>
            </div>
            <div className="space-y-2">
              {grupo.categorias.map((cat) => {
                const key = `${grupo.data}::${cat.categoria}`
                return (
                  <CategoriaAccordion
                    key={key}
                    categoria={cat.categoria}
                    itens={cat.itens}
                    tanques={tanques}
                    expandido={expandido === key}
                    onToggle={() => toggleExpandido(key)}
                    onOrdemCriada={recarregar}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/demanda/DemandaList.tsx
git commit -m "feat: componente DemandaList"
```

---

## Task 10: Página `/demanda`

**Files:**
- Create: `src/app/(dashboard)/demanda/page.tsx`

- [ ] **Step 1: Criar a página**

```typescript
// src/app/(dashboard)/demanda/page.tsx
import { createClient } from '@/lib/supabase/server'
import { DemandaList } from '@/components/demanda/DemandaList'
import type { ItemDemanda, Tanque } from '@/types'

async function buscarItens(): Promise<ItemDemanda[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('demanda_itens_pendentes', {
    p_mostrar_alocados: false,
  })
  if (error) {
    console.error('[demanda] erro ao buscar itens:', error.message)
    return []
  }
  return (data as ItemDemanda[]) ?? []
}

async function buscarTanques(): Promise<Tanque[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tanques')
    .select('*')
    .eq('ativo', true)
    .order('volume_liters', { ascending: true })
  if (error) return []
  return (data as Tanque[]) ?? []
}

export default async function DemandaPage() {
  const [itens, tanques] = await Promise.all([buscarItens(), buscarTanques()])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <DemandaList itensIniciais={itens} tanques={tanques} />
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/demanda/page.tsx
git commit -m "feat: página /demanda (server component)"
```

---

## Task 11: Adicionar item na Sidebar

**Files:**
- Modify: `src/components/ui/Sidebar.tsx`

- [ ] **Step 1: Adicionar import do ícone e o item no array `navItems`**

No topo do arquivo, o import de ícones já existe. Adicionar `ClipboardList` ao import existente:

```typescript
import { Calendar, BarChart3, Settings, LayoutDashboard, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
```

No array `navItems`, adicionar antes do item 'Admin':

```typescript
{ name: 'Demanda', href: '/demanda', icon: ClipboardList },
```

O array completo fica:

```typescript
const navItems = [
  { name: 'Dashboard', href: '/planner', icon: LayoutDashboard },
  { name: 'Calendário', href: '/calendario', icon: Calendar },
  { name: 'Monitoramento', href: '/monitoramento', icon: BarChart3 },
  { name: 'Demanda', href: '/demanda', icon: ClipboardList },
  { name: 'Admin', href: '/admin', icon: Settings },
]
```

- [ ] **Step 2: Verificar no browser**

Com o servidor rodando (`npm run dev`), acesse [http://localhost:3000/demanda](http://localhost:3000/demanda) e verifique:
- Item "Demanda" aparece na sidebar
- Página carrega sem erro
- Lista de grupos por data é exibida
- Accordion abre ao clicar numa categoria
- Checkbox seleciona itens e barra de progresso atualiza
- Ao atingir 100% da capacidade do tanque, checkboxes restantes ficam desabilitados
- Botão "Criar Ordem" aparece com o total de litros
- Após criar, itens desaparecem da lista

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Sidebar.tsx
git commit -m "feat: item Demanda na sidebar"
```

---

## Self-Review

**Cobertura do spec:**
- ✅ Agrupamento data → categoria → pedidos
- ✅ Toggle "Mostrar alocados"
- ✅ Dropdown de tanque por grupo
- ✅ Barra de % com bloqueio ao atingir 100%
- ✅ Checkbox por item/pedido
- ✅ Botão "Criar Ordem" com total de litros
- ✅ Criação de ordem com `BACKLOG` + `etapa=tanque` + `LITERS_MASTER`
- ✅ Tabela `ordens_pedidos_erp` com vínculos
- ✅ Filtro de pendentes via função RPC
- ✅ Recarregamento da lista após criação
- ✅ Link na sidebar

**Consistência de tipos:**
- `itemKey()` usa `numero_pedido::produto_descricao` de forma consistente em `CategoriaAccordion`
- `ItemDemanda.alocado` é `boolean | undefined` — todos os usos fazem `!item.alocado` ou `item.alocado === true`, o que é seguro
- `Tanque` vem de `src/types/index.ts` — `volume_liters` e `ativo` já existem no tipo

**Nota de rollback:** O `POST /api/demanda/ordens` faz rollback manual deletando a ordem se a inserção de vínculos falhar. O Supabase JS client não expõe transações diretas no edge — este é o padrão consistente com o resto da codebase.
