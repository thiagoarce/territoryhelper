-- RPCs pra editar geometria de quadra (desenhar/editar polígono) e juntar
-- quadras (ST_Union). Geometria via GeoJSON do front (terra-draw).

-- Salva polígono de quadra. p_criar=true insere nova; senão atualiza a forma.
create or replace function salvar_quadra_poligono(
  p_id text,
  p_geojson jsonb,
  p_color text default '#3388ff',
  p_territorio_id text default null,
  p_criar boolean default false
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_poly geometry;
begin
  if current_user not in ('postgres', 'service_role') and not is_admin() then
    raise exception 'Acesso negado';
  end if;
  if p_id is null or btrim(p_id) = '' then raise exception 'id obrigatório'; end if;

  v_poly := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326);
  if ST_GeometryType(v_poly) <> 'ST_Polygon' then
    raise exception 'Geometria precisa ser um polígono';
  end if;

  if p_criar then
    if exists (select 1 from quadras where id = p_id) then
      raise exception 'Quadra % já existe', p_id;
    end if;
    insert into quadras (id, poly, color, territorio_id)
    values (p_id, v_poly, coalesce(nullif(p_color,''), '#3388ff'), nullif(p_territorio_id, ''));
  else
    update quadras set poly = v_poly where id = p_id;
    if not found then raise exception 'Quadra % não encontrada', p_id; end if;
  end if;
  return p_id;
end;
$$;

-- Junta quadras: mantém p_ids[1] como sobrevivente, une os polígonos,
-- reassina locais/designações das outras pra ela e deleta as outras.
create or replace function quadras_join(p_ids text[])
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_keep text;
  v_outras text[];
  v_poly geometry;
begin
  if current_user not in ('postgres', 'service_role') and not is_admin() then
    raise exception 'Acesso negado';
  end if;
  if p_ids is null or array_length(p_ids, 1) < 2 then
    raise exception 'Selecione ao menos 2 quadras';
  end if;

  v_keep := p_ids[1];
  v_outras := p_ids[2:array_length(p_ids,1)];

  select ST_Union(poly) into v_poly from quadras where id = any(p_ids);
  if v_poly is null then raise exception 'Quadras não encontradas'; end if;
  -- União de quadras não-adjacentes vira MultiPolygon (coluna é Polygon)
  if ST_GeometryType(v_poly) <> 'ST_Polygon' then
    raise exception 'Quadras não são adjacentes — não dá pra juntar';
  end if;

  update quadras set poly = v_poly where id = v_keep;
  update locais set quadra_id = v_keep where quadra_id = any(v_outras);
  update designacao_quadras set quadra_id = v_keep where quadra_id = any(v_outras);
  delete from quadras where id = any(v_outras);

  return v_keep;
end;
$$;

revoke execute on function salvar_quadra_poligono(text, jsonb, text, text, boolean) from anon, authenticated;
grant execute on function salvar_quadra_poligono(text, jsonb, text, text, boolean) to authenticated, service_role;
revoke execute on function quadras_join(text[]) from anon, authenticated;
grant execute on function quadras_join(text[]) to authenticated, service_role;
