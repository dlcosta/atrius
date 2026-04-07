-- Migracao 002: Dashboard de producao (idempotente)
-- Pode ser executada em ambientes novos ou em bancos ja em uso.

-- Produtos: volume base e tempos por maquina
alter table produtos add column if not exists volume_base numeric not null default 3800;
alter table produtos add column if not exists tempos_maquinas jsonb not null default '{}'::jsonb;
alter table produtos add column if not exists tempo_limpeza_min integer not null default 0;

-- Se ainda existir a coluna antiga tempo_producao_min, converte para tempos_maquinas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'produtos'
      AND column_name = 'tempo_producao_min'
  ) THEN
    UPDATE produtos p
    SET tempos_maquinas = COALESCE(
      (
        SELECT jsonb_object_agg(m.id::text, jsonb_build_object('setup', 0, 'producao', GREATEST(p.tempo_producao_min, 0)))
        FROM maquinas m
      ),
      '{}'::jsonb
    )
    WHERE COALESCE(p.tempos_maquinas, '{}'::jsonb) = '{}'::jsonb;

    ALTER TABLE produtos DROP COLUMN tempo_producao_min;
  END IF;
END $$;

-- Ordens: marcadores e etapa do processo
alter table ordens add column if not exists tanque text;
alter table ordens add column if not exists lote text;
alter table ordens add column if not exists etapa text default 'envase';

update ordens
set etapa =
  case
    when upper(coalesce(produto_sku, '')) like 'TQ%' then 'tanque'
    when upper(coalesce(unidade, '')) in ('L', 'LT', 'LTS', 'LITRO', 'LITROS') then 'tanque'
    else 'envase'
  end
where etapa is null or etapa not in ('tanque', 'envase');

alter table ordens alter column etapa set not null;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordens_etapa_check'
  ) THEN
    ALTER TABLE ordens
      ADD CONSTRAINT ordens_etapa_check CHECK (etapa IN ('tanque', 'envase'));
  END IF;
END $$;

create index if not exists ordens_lote_idx on ordens(lote);
create index if not exists ordens_etapa_idx on ordens(etapa);
create index if not exists ordens_tanque_idx on ordens(tanque);
