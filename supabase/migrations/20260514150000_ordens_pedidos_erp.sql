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
