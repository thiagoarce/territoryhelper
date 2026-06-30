-- RPC pra criar TCE (Território Comercial Especial) a partir de locais
-- selecionados: calcula convex hull dos pontos (PostGIS, sem Turf no front)
-- e liga todas as unidades desses locais em tce_unidades.

-- Helper de remoção de acento tolerante (unaccent pode não estar instalado)
create or replace function unaccent_safe(t text)
returns text language plpgsql immutable as $$
begin
  return translate(t,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
end;
$$;

create or replace function criar_tce(
  p_nome text,
  p_tipo text,
  p_local_ids bigint[]
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id text;
  v_base text;
  v_n int := 2;
  v_hull geometry;
begin
  -- só admin (ou service_role) cria
  if current_user not in ('postgres', 'service_role') and not is_admin() then
    raise exception 'Acesso negado';
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    raise exception 'Nome obrigatório';
  end if;
  if p_local_ids is null or array_length(p_local_ids, 1) is null then
    raise exception 'Selecione ao menos 1 endereço';
  end if;

  -- Convex hull dos pontos dos locais. Se <3 pontos vira ponto/linha → buffer
  -- pequeno pra garantir um Polygon (coluna é geometry(Polygon,4326)).
  select ST_ConvexHull(ST_Collect(geo)) into v_hull
  from locais where id = any(p_local_ids) and geo is not null;
  if v_hull is null then
    raise exception 'Nenhum endereço com coordenada';
  end if;
  if ST_GeometryType(v_hull) <> 'ST_Polygon' then
    v_hull := ST_Buffer(v_hull, 0.0001);
  end if;

  -- id = slug do nome, sufixa se colidir
  v_base := regexp_replace(lower(unaccent_safe(p_nome)), '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  if v_base = '' then v_base := 'tce'; end if;
  v_base := left(v_base, 40);
  v_id := v_base;
  while exists (select 1 from tces where id = v_id) loop
    v_id := v_base || '-' || v_n;
    v_n := v_n + 1;
  end loop;

  insert into tces (id, nome, tipo, poly, status)
  values (v_id, p_nome, coalesce(nullif(p_tipo, ''), 'comercial'), v_hull, 'aberto');

  -- Liga TODAS as unidades dos locais selecionados
  insert into tce_unidades (tce_id, unidade_id)
  select v_id, u.id from unidades u where u.local_id = any(p_local_ids)
  on conflict do nothing;

  return v_id;
end;
$$;

revoke execute on function criar_tce(text, text, bigint[]) from anon, authenticated;
grant execute on function criar_tce(text, text, bigint[]) to authenticated, service_role;
