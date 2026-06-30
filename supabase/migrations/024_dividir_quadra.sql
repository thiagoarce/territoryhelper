-- RPC pra dividir (split) uma quadra por uma linha desenhada (terra-draw).
-- A linha precisa cortar a quadra de lado a lado (ST_Split exige isso).

create or replace function dividir_quadra(
  p_id text,
  p_line jsonb,
  p_novo_id text
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_orig quadras%rowtype;
  v_line geometry;
  v_split geometry;
  v_polys geometry[];
  v_a geometry;
  v_b geometry;
begin
  if current_user not in ('postgres', 'service_role') and not is_admin() then
    raise exception 'Acesso negado';
  end if;
  if p_novo_id is null or btrim(p_novo_id) = '' then raise exception 'Novo id obrigatório'; end if;
  if exists (select 1 from quadras where id = p_novo_id) then
    raise exception 'Quadra % já existe', p_novo_id;
  end if;

  select * into v_orig from quadras where id = p_id;
  if not found then raise exception 'Quadra % não encontrada', p_id; end if;

  v_line := ST_SetSRID(ST_GeomFromGeoJSON(p_line::text), 4326);

  -- ST_Split → GeometryCollection; pega só os polígonos resultantes
  v_split := ST_Split(v_orig.poly, v_line);
  select array_agg(g) into v_polys
  from (
    select (ST_Dump(v_split)).geom as g
  ) d
  where ST_GeometryType(g) = 'ST_Polygon';

  if v_polys is null or array_length(v_polys, 1) <> 2 then
    raise exception 'A linha precisa cortar a quadra de lado a lado (gerou % parte(s))',
      coalesce(array_length(v_polys, 1), 0);
  end if;
  v_a := v_polys[1];
  v_b := v_polys[2];

  -- Parte A fica na quadra original; parte B vira a nova
  update quadras set poly = v_a where id = p_id;
  insert into quadras (id, poly, color, territorio_id, status, ativa)
  values (p_novo_id, v_b, v_orig.color, v_orig.territorio_id, v_orig.status, v_orig.ativa);

  -- Reassina locais da quadra original que caíram na parte B
  update locais set quadra_id = p_novo_id
  where quadra_id = p_id and geo is not null and ST_Contains(v_b, geo);

  -- Designações que tinham a quadra original passam a incluir a nova também
  insert into designacao_quadras (designacao_id, quadra_id)
  select designacao_id, p_novo_id from designacao_quadras where quadra_id = p_id
  on conflict do nothing;

  return p_novo_id;
end;
$$;

revoke execute on function dividir_quadra(text, jsonb, text) from anon, authenticated;
grant execute on function dividir_quadra(text, jsonb, text) to authenticated, service_role;
