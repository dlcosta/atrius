-- Migracao 010: ponte controlada entre dados ERP/Olist e a plataforma operacional.
--
-- Mantem as tabelas *_erp como fonte bruta e materializa apenas produtos/ordens
-- necessarios para o planner em tabelas ja consumidas pela interface.

alter table ordens drop constraint if exists ordens_status_check;
alter table ordens
  add constraint ordens_status_check
  check (status in ('aguardando','produzindo','limpeza','concluida','atrasada','cancelada'));

create or replace function public.sincronizar_erp_para_plataforma(
  p_limite integer default 1000,
  p_data_inicial date default null,
  p_data_final date default null,
  p_incluir_sem_data boolean default false
)
returns table (
  produtos_importados integer,
  ordens_importadas integer,
  ordens_atualizadas integer,
  ordens_ignoradas integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 1000), 5000));
  v_produtos_importados integer := 0;
  v_ordens_importadas integer := 0;
  v_ordens_atualizadas integer := 0;
  v_candidatas integer := 0;
begin
  -- Garante que todo SKU vindo dos itens exista na tabela operacional.
  -- Nao sobrescreve tempos/volume/cor ja configurados manualmente no admin.
  with produtos_candidatos as (
    select distinct on (trim(i.produto_sku))
      trim(i.produto_sku) as sku,
      coalesce(nullif(trim(pe.descricao), ''), nullif(trim(i.produto_descricao), ''), trim(i.produto_sku)) as nome
    from pedidos_erp_itens i
    left join produtos_erp pe on pe.id_olist = i.produto_id_olist
    where nullif(trim(coalesce(i.produto_sku, '')), '') is not null
    order by trim(i.produto_sku), pe.sincronizado_em desc nulls last, i.sincronizado_em desc nulls last
  ),
  inseridos as (
    insert into produtos (sku, nome, volume_base, tempos_maquinas, tempo_limpeza_min, cor)
    select
      sku,
      nome,
      3800,
      '{}'::jsonb,
      0,
      '#' || substr(md5(sku), 1, 6)
    from produtos_candidatos
    on conflict (sku) do nothing
    returning 1
  )
  select count(*)::integer into v_produtos_importados from inseridos;

  create temporary table tmp_ordens_erp_plataforma on commit drop as
  select *
  from (
    select
      format(
        'ERP-%s-%s',
        coalesce(p.numero_pedido::text, p.id_olist::text),
        i.item_sequencia::text
      ) as numero_externo,
      trim(i.produto_sku) as produto_sku,
      null::uuid as maquina_id,
      coalesce(i.quantidade, 0) as quantidade,
      upper(coalesce(nullif(trim(pe.unidade), ''), 'UN')) as unidade,
      coalesce(p.data_prevista::date, p.data_criacao::date) as data_prevista,
      format('PED-%s', coalesce(p.numero_pedido::text, p.id_olist::text)) as lote,
      case
        when upper(trim(i.produto_sku)) like 'TQ%' then 'tanque'
        when upper(coalesce(nullif(trim(pe.unidade), ''), 'UN')) in ('L', 'LT', 'LTS', 'LITRO', 'LITROS') then 'tanque'
        else 'envase'
      end as etapa,
      case
        when p.situacao = 2 then 'cancelada'
        else 'aguardando'
      end as status,
      greatest(p.sincronizado_em, i.sincronizado_em) as sincronizado_em
    from pedidos_erp p
    join pedidos_erp_itens i on i.pedido_id_olist = p.id_olist
    left join produtos_erp pe on pe.id_olist = i.produto_id_olist
    where nullif(trim(coalesce(i.produto_sku, '')), '') is not null
      and coalesce(i.quantidade, 0) > 0
      and (p_data_inicial is null or coalesce(p.data_prevista::date, p.data_criacao::date) >= p_data_inicial)
      and (p_data_final is null or coalesce(p.data_prevista::date, p.data_criacao::date) <= p_data_final)
      and (
        p_incluir_sem_data
        or p.data_prevista is not null
        or p.data_criacao is not null
      )
    order by
      coalesce(p.data_prevista::date, p.data_criacao::date) desc nulls last,
      p.sincronizado_em desc nulls last,
      p.id_olist desc,
      i.item_sequencia asc
    limit v_limite
  ) candidatos;

  select count(*)::integer into v_candidatas from tmp_ordens_erp_plataforma;

  with inseridas as (
    insert into ordens (
      numero_externo,
      produto_sku,
      maquina_id,
      quantidade,
      unidade,
      data_prevista,
      tanque,
      lote,
      etapa,
      status,
      sincronizado_em
    )
    select
      numero_externo,
      produto_sku,
      maquina_id,
      quantidade,
      unidade,
      data_prevista,
      null,
      lote,
      etapa,
      status,
      sincronizado_em
    from tmp_ordens_erp_plataforma
    on conflict (numero_externo) do nothing
    returning 1
  )
  select count(*)::integer into v_ordens_importadas from inseridas;

  with atualizadas as (
    update ordens o
    set
      produto_sku = t.produto_sku,
      quantidade = t.quantidade,
      unidade = t.unidade,
      data_prevista = t.data_prevista,
      lote = t.lote,
      etapa = t.etapa,
      status = case when o.status in ('produzindo', 'limpeza', 'concluida') then o.status else t.status end,
      sincronizado_em = t.sincronizado_em
    from tmp_ordens_erp_plataforma t
    where o.numero_externo = t.numero_externo
      and o.inicio_agendado is null
    returning 1
  )
  select count(*)::integer into v_ordens_atualizadas from atualizadas;

  produtos_importados := v_produtos_importados;
  ordens_importadas := v_ordens_importadas;
  ordens_atualizadas := greatest(v_ordens_atualizadas - v_ordens_importadas, 0);
  ordens_ignoradas := greatest(v_candidatas - v_ordens_importadas - ordens_atualizadas, 0);
  return next;
end;
$$;
