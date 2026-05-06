-- Migration: configuration fields used by the machine calendar order editor.
--
-- The UI stores production/setup times per machine in produtos.tempos_maquinas
-- and stores cleanup time in produtos.tempo_limpeza_min. Older databases may
-- have these columns without the validation constraints because they were added
-- by an idempotent migration after the initial schema.

alter table public.produtos
  add column if not exists volume_base numeric not null default 3800;

alter table public.produtos
  add column if not exists tempos_maquinas jsonb not null default '{}'::jsonb;

alter table public.produtos
  add column if not exists tempo_limpeza_min integer not null default 0;

alter table public.ordens
  add column if not exists duracao_planejada_min integer;

update public.produtos
set
  volume_base = coalesce(nullif(volume_base, 0), 3800),
  tempos_maquinas = coalesce(tempos_maquinas, '{}'::jsonb),
  tempo_limpeza_min = greatest(coalesce(tempo_limpeza_min, 0), 0);

alter table public.produtos
  alter column volume_base set default 3800,
  alter column volume_base set not null,
  alter column tempos_maquinas set default '{}'::jsonb,
  alter column tempos_maquinas set not null,
  alter column tempo_limpeza_min set default 0,
  alter column tempo_limpeza_min set not null;

update public.ordens
set fim_calculado = null
where inicio_agendado is null
  and fim_calculado is not null;

update public.ordens
set fim_calculado = inicio_agendado + interval '1 minute'
where inicio_agendado is not null
  and (fim_calculado is null or fim_calculado <= inicio_agendado);

update public.ordens
set duracao_planejada_min = greatest(
  1,
  round(extract(epoch from (fim_calculado - inicio_agendado)) / 60)::integer
)
where duracao_planejada_min is null
  and inicio_agendado is not null
  and fim_calculado is not null
  and fim_calculado > inicio_agendado;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'produtos_volume_base_positive_check'
  ) then
    alter table public.produtos
      add constraint produtos_volume_base_positive_check
      check (volume_base > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'produtos_tempo_limpeza_nonnegative_check'
  ) then
    alter table public.produtos
      add constraint produtos_tempo_limpeza_nonnegative_check
      check (tempo_limpeza_min >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'produtos_tempos_maquinas_object_check'
  ) then
    alter table public.produtos
      add constraint produtos_tempos_maquinas_object_check
      check (jsonb_typeof(tempos_maquinas) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ordens_duracao_planejada_positive_check'
  ) then
    alter table public.ordens
      add constraint ordens_duracao_planejada_positive_check
      check (duracao_planejada_min is null or duracao_planejada_min > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ordens_agendamento_intervalo_check'
  ) then
    alter table public.ordens
      add constraint ordens_agendamento_intervalo_check
      check (
        (inicio_agendado is null and fim_calculado is null)
        or (inicio_agendado is not null and fim_calculado is not null and fim_calculado > inicio_agendado)
      );
  end if;
end $$;
