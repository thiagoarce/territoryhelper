-- ============================================================================
-- 013_auto_vincular.sql
-- Função PostGIS pra auto-vincular endereços a quadras via point-in-polygon.
-- Atualiza locais.quadra_id quando ST_Contains da quadra cobre o ponto.
-- Só atualiza locais com quadra_id NULL (não sobrescreve manual).
-- ============================================================================

create or replace function auto_vincular_enderecos()
returns table (
  total_avaliados integer,
  vinculados integer,
  sem_match integer
)
language plpgsql security definer set search_path = public
as $$
declare
  v_total integer;
  v_vinculados integer;
begin
  if current_user not in ('postgres', 'service_role') and not is_admin() then
    raise exception 'Acesso negado: requer admin';
  end if;

  select count(*) into v_total
  from locais l
  where l.quadra_id is null and l.geo is not null;

  with vinculacoes as (
    update locais l
    set quadra_id = q.id
    from quadras q
    where l.quadra_id is null
      and l.geo is not null
      and ST_Contains(q.poly, l.geo)
    returning l.id
  )
  select count(*) into v_vinculados from vinculacoes;

  return query select v_total, v_vinculados, v_total - v_vinculados;
end;
$$;

grant execute on function auto_vincular_enderecos() to authenticated;

-- ============================================================================
-- Função pra retornar quadras candidatas pra um endereço (point-in-polygon)
-- ============================================================================
create or replace function quadras_candidatas_para(p_local_id bigint)
returns table (quadra_id text, color text, distancia_metros double precision)
language sql stable security invoker
as $$
  select
    q.id,
    q.color,
    ST_Distance(q.poly::geography, l.geo::geography) as dist
  from locais l
  cross join quadras q
  where l.id = p_local_id and l.geo is not null
  order by ST_Contains(q.poly, l.geo) desc, dist asc
  limit 5;
$$;

grant execute on function quadras_candidatas_para(bigint) to authenticated;
