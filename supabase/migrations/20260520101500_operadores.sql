create table if not exists public.operadores (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'operadores_nome_not_blank_check'
  ) then
    alter table public.operadores
      add constraint operadores_nome_not_blank_check
      check (length(btrim(nome)) > 0);
  end if;
end $$;

create unique index if not exists operadores_nome_unique_idx
  on public.operadores (lower(nome));

alter table public.operadores enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'operadores'
      and policyname = 'leitura publica operadores'
  ) then
    create policy "leitura publica operadores" on public.operadores for select using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'operadores'
      and policyname = 'escrita publica operadores'
  ) then
    create policy "escrita publica operadores" on public.operadores for all using (true);
  end if;
end $$;
