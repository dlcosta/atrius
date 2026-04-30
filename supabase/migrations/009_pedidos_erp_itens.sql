-- Migracao 009: itens de pedidos ERP + controle de sincronizacao incremental

create table if not exists pedidos_erp_itens (
  id bigserial primary key,
  pedido_id_olist bigint not null references pedidos_erp(id_olist) on delete cascade,
  item_sequencia integer not null,
  produto_id_olist bigint,
  produto_sku text,
  produto_descricao text,
  produto_tipo text,
  quantidade numeric,
  valor_unitario numeric,
  info_adicional text,
  sincronizado_em timestamptz not null default now(),
  constraint pedidos_erp_itens_unq unique (pedido_id_olist, item_sequencia)
);

create index if not exists pedidos_erp_itens_pedido_idx on pedidos_erp_itens(pedido_id_olist);
create index if not exists pedidos_erp_itens_produto_id_idx on pedidos_erp_itens(produto_id_olist);
create index if not exists pedidos_erp_itens_produto_sku_idx on pedidos_erp_itens(produto_sku);

alter table pedidos_erp_itens enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pedidos_erp_itens'
      AND policyname = 'leitura publica pedidos_erp_itens'
  ) THEN
    CREATE POLICY "leitura publica pedidos_erp_itens" ON pedidos_erp_itens FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pedidos_erp_itens'
      AND policyname = 'escrita publica pedidos_erp_itens'
  ) THEN
    CREATE POLICY "escrita publica pedidos_erp_itens" ON pedidos_erp_itens FOR ALL USING (true);
  END IF;
END $$;

create table if not exists sincronizacao_erp_controle (
  chave text primary key,
  valor_texto text not null,
  atualizado_em timestamptz not null default now()
);

alter table sincronizacao_erp_controle enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sincronizacao_erp_controle'
      AND policyname = 'leitura publica sincronizacao_erp_controle'
  ) THEN
    CREATE POLICY "leitura publica sincronizacao_erp_controle" ON sincronizacao_erp_controle FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sincronizacao_erp_controle'
      AND policyname = 'escrita publica sincronizacao_erp_controle'
  ) THEN
    CREATE POLICY "escrita publica sincronizacao_erp_controle" ON sincronizacao_erp_controle FOR ALL USING (true);
  END IF;
END $$;
