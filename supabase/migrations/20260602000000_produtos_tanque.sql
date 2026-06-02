create table if not exists public.produtos_tanque (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  nome text not null,
  cor text not null default '#5B9BD5',
  volume_base numeric not null default 3800,
  tempo_limpeza_min integer not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists produtos_tanque_sku_idx on public.produtos_tanque (sku);

alter table public.produtos_tanque enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'produtos_tanque'
      and policyname = 'leitura publica produtos_tanque'
  ) then
    create policy "leitura publica produtos_tanque"
      on public.produtos_tanque for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'produtos_tanque'
      and policyname = 'escrita publica produtos_tanque'
  ) then
    create policy "escrita publica produtos_tanque"
      on public.produtos_tanque for all using (true) with check (true);
  end if;
end $$;
