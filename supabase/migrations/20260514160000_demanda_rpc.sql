create or replace function public.demanda_itens_pendentes(
  p_mostrar_alocados boolean default false
)
returns table (
  data_prevista       timestamptz,
  categoria_produto   text,
  produto_descricao   text,
  numero_pedido       text,
  cliente_nome        text,
  quantidade          numeric,
  litros_por_unidade  numeric,
  unidades_por_embalagem numeric,
  total_litros        numeric,
  alocado             boolean,
  ordem_id            uuid,
  ordem_status        text
)
language sql
stable
as $$
  with base as (
    select
      v.data_prevista,
      v.produto_descricao,
      v.numero_pedido,
      v.cliente_nome,
      v.quantidade,
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              v.produto_descricao,
              '[[:space:]]+[0-9]+[[:space:]]*(ML|L|LT|LTS|KG|G)([[:space:]]|$)',
              ' ', 'gi'
            ),
            '[[:space:]]*-[[:space:]]*(CX|FD)[[:space:]].*',
            '', 'gi'
          ),
          '[[:space:]]+', ' ', 'g'
        )
      ) as categoria_produto,
      case
        when v.produto_descricao ~* '500[[:space:]]*ML' then 0.5
        when v.produto_descricao ~* '[[:space:]]1[[:space:]]*(L|LT|LTS)' then 1
        when v.produto_descricao ~* '[[:space:]]2[[:space:]]*(L|LT|LTS)' then 2
        when v.produto_descricao ~* '[[:space:]]5[[:space:]]*(L|LT|LTS)' then 5
        else 0
      end as litros_por_unidade,
      case
        when v.produto_descricao ~* 'C/[[:space:]]*24[[:space:]]*UN' then 24
        when v.produto_descricao ~* 'C/[[:space:]]*12[[:space:]]*UN' then 12
        when v.produto_descricao ~* 'C/[[:space:]]*6[[:space:]]*UN'  then 6
        when v.produto_descricao ~* 'C/[[:space:]]*4[[:space:]]*UN'  then 4
        else 1
      end as unidades_por_embalagem
    from public.v_pedidos_erp_com_itens v
  ),
  agrupado as (
    select
      data_prevista,
      categoria_produto,
      produto_descricao,
      numero_pedido,
      cliente_nome,
      sum(quantidade)::numeric as quantidade,
      max(litros_por_unidade)::numeric as litros_por_unidade,
      max(unidades_por_embalagem)::numeric as unidades_por_embalagem,
      sum(quantidade * litros_por_unidade * unidades_por_embalagem)::numeric as total_litros
    from base
    group by
      data_prevista, categoria_produto, produto_descricao, numero_pedido, cliente_nome
  ),
  com_alocacao as (
    select
      a.*,
      ope.ordem_id,
      o.planning_status as ordem_status,
      (ope.ordem_id is not null) as alocado
    from agrupado a
    left join public.ordens_pedidos_erp ope
      on ope.numero_pedido = a.numero_pedido
      and ope.produto_descricao = a.produto_descricao
    left join public.ordens o on o.id = ope.ordem_id
  )
  select
    data_prevista,
    categoria_produto,
    produto_descricao,
    numero_pedido,
    cliente_nome,
    quantidade,
    litros_por_unidade,
    unidades_por_embalagem,
    total_litros,
    coalesce(alocado, false) as alocado,
    ordem_id,
    ordem_status
  from com_alocacao
  where p_mostrar_alocados = true or coalesce(alocado, false) = false
  order by data_prevista, categoria_produto, produto_descricao
$$;
