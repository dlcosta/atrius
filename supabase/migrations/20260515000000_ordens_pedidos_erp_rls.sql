-- Enable RLS and create policies for ordens_pedidos_erp

alter table public.ordens_pedidos_erp enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ordens_pedidos_erp'
      and policyname = 'leitura publica ordens_pedidos_erp'
  ) then
    create policy "leitura publica ordens_pedidos_erp" on public.ordens_pedidos_erp for select using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ordens_pedidos_erp'
      and policyname = 'escrita publica ordens_pedidos_erp'
  ) then
    create policy "escrita publica ordens_pedidos_erp" on public.ordens_pedidos_erp for insert with check (true);
  end if;
end $$;
