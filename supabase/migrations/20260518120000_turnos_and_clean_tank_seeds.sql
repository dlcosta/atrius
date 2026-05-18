create table if not exists public.turnos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  hora_inicio smallint not null check (hora_inicio >= 0 and hora_inicio <= 1439),
  hora_fim smallint not null check (hora_fim >= 0 and hora_fim <= 1439),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

update public.tanques set ativo = false where id in ('tank-3800', 'tank-5000', 'tank-10000');

alter table public.turnos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'turnos'
      and policyname = 'leitura publica turnos'
  ) then
    create policy "leitura publica turnos" on public.turnos for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'turnos'
      and policyname = 'escrita publica turnos'
  ) then
    create policy "escrita publica turnos" on public.turnos for all using (true);
  end if;
end $$;
