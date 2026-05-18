-- Atualiza as constraints de hora_inicio/hora_fim para suportar minutos (0-1439)
alter table public.turnos
  drop constraint if exists turnos_hora_inicio_check,
  drop constraint if exists turnos_hora_fim_check;

alter table public.turnos
  add constraint turnos_hora_inicio_check check (hora_inicio >= 0 and hora_inicio <= 1439),
  add constraint turnos_hora_fim_check check (hora_fim >= 0 and hora_fim <= 1439);

-- RLS para a tabela turnos
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
