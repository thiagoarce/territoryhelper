-- RPCs usadas pelo aplicativo operacional. A baseline já nasce com as
-- versões finais necessárias ao piloto, sem reproduzir a evolução 001–090.

create or replace function public.auto_vincular_enderecos()
returns table(total_avaliados integer, vinculados integer, sem_match integer)
language plpgsql security definer set search_path = public as $$
declare v_total integer; v_vinculados integer;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select count(*)::integer into v_total from public.locais where quadra_id is null and geo is not null;
  with atualizados as (
    update public.locais l set quadra_id = q.id
    from public.quadras q
    where l.quadra_id is null and l.geo is not null and q.ativa
      and q.finalidade = 'regular-preaching' and q.revisao_status = 'approved'
      and ST_Covers(q.poly, l.geo)
    returning l.id
  ) select count(*)::integer into v_vinculados from atualizados;
  return query select v_total, v_vinculados, v_total - v_vinculados;
end;
$$;

create or replace function public.buscar_locais_proximos(
  p_lat double precision, p_lng double precision, p_limite integer default 30, p_raio_m integer default 2000
) returns table(
  id bigint, tipo text, logradouro text, numero text, nome text, quadra_id text, distancia_m double precision
) language sql stable security definer set search_path = public as $$
  select l.id, l.tipo::text, l.logradouro, l.numero, l.nome, l.quadra_id,
    ST_Distance(l.geo::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
  from public.locais l
  where l.geo is not null and not l.pendente and not l.marcado_nao_existe
    and ST_DWithin(l.geo::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_raio_m)
  order by l.geo <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
  limit greatest(1, least(p_limite, 100));
$$;

create or replace function public.unaccent_safe(p_text text)
returns text language sql immutable parallel safe as $$
  select translate(p_text,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
$$;

create or replace function public.criar_tce(p_nome text, p_tipo text, p_local_ids bigint[])
returns text language plpgsql security definer set search_path = public as $$
declare v_id text; v_base text; v_n integer := 2; v_hull geometry;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_nome), '') is null then raise exception 'Nome obrigatório'; end if;
  if coalesce(array_length(p_local_ids, 1), 0) = 0 then raise exception 'Selecione ao menos um endereço'; end if;
  select ST_ConvexHull(ST_Collect(geo)) into v_hull from public.locais where id = any(p_local_ids) and geo is not null;
  if v_hull is null then raise exception 'Nenhum endereço possui coordenada'; end if;
  if ST_GeometryType(v_hull) <> 'ST_Polygon' then v_hull := ST_Buffer(v_hull, 0.0001); end if;
  v_base := left(btrim(regexp_replace(lower(public.unaccent_safe(p_nome)), '[^a-z0-9]+', '-', 'g'), '-'), 40);
  if v_base = '' then v_base := 'tce'; end if;
  v_id := v_base;
  while exists (select 1 from public.tces where id = v_id) loop v_id := v_base || '-' || v_n; v_n := v_n + 1; end loop;
  insert into public.tces(id, nome, tipo, poly) values (v_id, p_nome, coalesce(nullif(p_tipo, ''), 'comercial'), v_hull);
  insert into public.tce_unidades(tce_id, unidade_id)
    select v_id, id from public.unidades where local_id = any(p_local_ids) on conflict do nothing;
  return v_id;
end;
$$;

create or replace function public.salvar_quadra_poligono(
  p_id text, p_geojson jsonb, p_color text default '#3388ff',
  p_territorio_id text default null, p_criar boolean default false
) returns text language plpgsql security definer set search_path = public as $$
declare v_poly geometry;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_id), '') is null then raise exception 'Identificador obrigatório'; end if;
  v_poly := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326);
  if ST_GeometryType(v_poly) <> 'ST_Polygon' or not ST_IsValid(v_poly) then raise exception 'Polígono inválido'; end if;
  if p_criar then
    insert into public.quadras(id, poly, color, territorio_id)
      values (p_id, v_poly, coalesce(nullif(p_color, ''), '#3388ff'), nullif(p_territorio_id, ''));
  else
    update public.quadras set poly = v_poly where id = p_id;
    if not found then raise exception 'QUADRA_NOT_FOUND'; end if;
  end if;
  return p_id;
end;
$$;

create or replace function public.quadras_join(p_ids text[])
returns text language plpgsql security definer set search_path = public as $$
declare v_keep text; v_others text[]; v_poly geometry;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if coalesce(array_length(p_ids, 1), 0) < 2 then raise exception 'Selecione ao menos duas quadras'; end if;
  v_keep := p_ids[1]; v_others := p_ids[2:array_length(p_ids, 1)];
  select ST_Union(poly) into v_poly from public.quadras where id = any(p_ids);
  if v_poly is null then raise exception 'QUADRA_NOT_FOUND'; end if;
  if ST_GeometryType(v_poly) <> 'ST_Polygon' then raise exception 'As quadras precisam ser adjacentes'; end if;
  update public.quadras set poly = v_poly where id = v_keep;
  update public.locais set quadra_id = v_keep where quadra_id = any(v_others);
  insert into public.designacao_quadras(designacao_id, quadra_id)
    select distinct designacao_id, v_keep from public.designacao_quadras where quadra_id = any(v_others)
    on conflict do nothing;
  delete from public.quadras where id = any(v_others);
  return v_keep;
end;
$$;

create or replace function public.dividir_quadra(p_id text, p_line jsonb, p_novo_id text)
returns text language plpgsql security definer set search_path = public as $$
declare v_original public.quadras%rowtype; v_split geometry; v_parts geometry[];
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_novo_id), '') is null then raise exception 'Novo identificador obrigatório'; end if;
  if exists (select 1 from public.quadras where id = p_novo_id) then raise exception 'A nova quadra já existe'; end if;
  select * into v_original from public.quadras where id = p_id;
  if not found then raise exception 'QUADRA_NOT_FOUND'; end if;
  v_split := ST_Split(v_original.poly, ST_SetSRID(ST_GeomFromGeoJSON(p_line::text), 4326));
  select array_agg(geom) into v_parts from ST_Dump(v_split) where ST_GeometryType(geom) = 'ST_Polygon';
  if coalesce(array_length(v_parts, 1), 0) <> 2 then raise exception 'A linha precisa cortar a quadra de lado a lado'; end if;
  update public.quadras set poly = v_parts[1] where id = p_id;
  insert into public.quadras(id, poly, color, territorio_id, status, ativa)
    values (p_novo_id, v_parts[2], v_original.color, v_original.territorio_id, v_original.status, v_original.ativa);
  update public.locais set quadra_id = p_novo_id
    where quadra_id = p_id and geo is not null and ST_Covers(v_parts[2], geo);
  insert into public.designacao_quadras(designacao_id, quadra_id)
    select designacao_id, p_novo_id from public.designacao_quadras where quadra_id = p_id on conflict do nothing;
  return p_novo_id;
end;
$$;

create or replace function public.reportar_posicao_incorreta(
  p_local_id bigint, p_novo_geo jsonb default null, p_nova_quadra_id text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_geo geometry; v_setor text; v_quadra_ibge text; v_face_ibge text;
begin
  if not public.pode_editar_local(p_local_id) then raise exception 'LOCAL_NOT_ASSIGNED'; end if;
  if p_novo_geo is null and p_nova_quadra_id is null then raise exception 'Nada para atualizar'; end if;
  if p_novo_geo is not null then v_geo := ST_SetSRID(ST_GeomFromGeoJSON(p_novo_geo::text), 4326); end if;
  perform set_config('app.permitir_correcao_posicao', 'true', true);
  if p_nova_quadra_id is not null then
    select setor, quadra_ibge, face_ibge into v_setor, v_quadra_ibge, v_face_ibge
      from public.locais where quadra_id = p_nova_quadra_id and setor is not null limit 1;
    update public.locais set quadra_id = p_nova_quadra_id, setor = v_setor,
      quadra_ibge = v_quadra_ibge, face_ibge = v_face_ibge, geo = coalesce(v_geo, geo)
      where id = p_local_id;
  else
    update public.locais set geo = coalesce(v_geo, geo) where id = p_local_id;
  end if;
  if not found then raise exception 'Endereço não encontrado'; end if;
end;
$$;

create or replace function public.carta_publica_dados(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_local_id bigint; v_result jsonb;
begin
  select local_id into v_local_id from public.cartas_tokens
    where token = p_token and (expira_em is null or expira_em > now());
  if v_local_id is null then return null; end if;
  select jsonb_build_object(
    'local', jsonb_build_object('id', l.id, 'logradouro', l.logradouro, 'numero', l.numero,
      'nome', l.nome, 'tipo_entrada', l.tipo_entrada, 'acesso_caixas', l.acesso_caixas,
      'acesso_interfones', l.acesso_interfones, 'irmao_mora', l.irmao_mora,
      'nome_irmao', l.nome_irmao, 'notas', l.notas),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'complemento', u.complemento,
      'carta_entregue', u.carta_entregue, 'desocupado', u.desocupado, 'nao_escrever', u.nao_escrever,
      'nota', u.nota, 'ordem', u.ordem) order by u.ordem nulls last, u.complemento)
      from public.unidades u where u.local_id = l.id), '[]'::jsonb)
  ) into v_result from public.locais l where l.id = v_local_id;
  return v_result;
end;
$$;

create or replace function public.carta_publica_toggle(p_token uuid, p_unidade_id bigint, p_campo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_local_id bigint; v_unit_local bigint; v_cycle date;
begin
  select local_id into v_local_id from public.cartas_tokens
    where token = p_token and (expira_em is null or expira_em > now());
  if v_local_id is null then raise exception 'Link inválido ou expirado'; end if;
  select local_id into v_unit_local from public.unidades where id = p_unidade_id;
  if v_unit_local is distinct from v_local_id then raise exception 'Unidade não pertence a este prédio'; end if;
  select max(iniciado_em) into v_cycle from public.cartas_ciclos where local_id is null or local_id = v_local_id;
  if p_campo = 'carta_entregue' then
    update public.unidades set carta_entregue = case
      when carta_entregue is null or (v_cycle is not null and carta_entregue < v_cycle) then current_date else null end,
      carta_escrita_por = null where id = p_unidade_id;
  elsif p_campo = 'desocupado' then
    update public.unidades set desocupado = not desocupado where id = p_unidade_id;
  elsif p_campo = 'nao_escrever' then
    update public.unidades set nao_escrever = not nao_escrever where id = p_unidade_id;
  else raise exception 'Campo inválido'; end if;
  update public.cartas_tokens set qtd_acessos = qtd_acessos + 1 where token = p_token;
end;
$$;

create or replace function public.territorio_publico(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_token public.territorio_tokens%rowtype; v_result jsonb;
begin
  select * into v_token from public.territorio_tokens
    where token = p_token and (expira_em is null or expira_em > now());
  if not found then return null; end if;
  if v_token.arranjo_id is not null then
    select jsonb_build_object('tipo', 'arranjo', 'titulo', coalesce(a.nome, 'Arranjo'),
      'data', a.data, 'hora_inicio', a.hora_inicio, 'local_endereco', a.local_endereco, 'notas', a.notas,
      'quadras', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'color', q.color,
        'poly_geojson', ST_AsGeoJSON(q.poly)::jsonb)) from public.quadras q where q.id = any(a.quadras_ids)), '[]'::jsonb),
      'predios', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome,
        'logradouro', l.logradouro, 'numero', l.numero, 'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb))
        from public.locais l where l.id = any(a.cartas_locais_ids)), '[]'::jsonb),
      'tces', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome,
        'poly_geojson', ST_AsGeoJSON(t.poly)::jsonb)) from public.tces t where t.id = any(a.tces_ids)), '[]'::jsonb)
    ) into v_result from public.arranjos a where a.id = v_token.arranjo_id;
  else
    select jsonb_build_object('tipo', 'designacao', 'titulo', coalesce(p.nome, 'Território pessoal'),
      'prazo', d.prazo, 'notas', d.notas,
      'quadras', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'color', q.color,
        'poly_geojson', ST_AsGeoJSON(q.poly)::jsonb)) from public.designacao_quadras dq
        join public.quadras q on q.id = dq.quadra_id where dq.designacao_id = d.id), '[]'::jsonb),
      'predios', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome,
        'logradouro', l.logradouro, 'numero', l.numero, 'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb))
        from public.designacao_locais dl join public.locais l on l.id = dl.local_id
        where dl.designacao_id = d.id), '[]'::jsonb),
      'tces', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome,
        'poly_geojson', ST_AsGeoJSON(t.poly)::jsonb)) from public.designacao_tces dt
        join public.tces t on t.id = dt.tce_id where dt.designacao_id = d.id), '[]'::jsonb)
    ) into v_result from public.designacoes d left join public.profiles p on p.id = d.publicador_id
      where d.id = v_token.designacao_id;
  end if;
  return v_result;
end;
$$;

revoke execute on function public.auto_vincular_enderecos() from public;
revoke execute on function public.criar_tce(text, text, bigint[]) from public;
revoke execute on function public.salvar_quadra_poligono(text, jsonb, text, text, boolean) from public;
revoke execute on function public.quadras_join(text[]) from public;
revoke execute on function public.dividir_quadra(text, jsonb, text) from public;
revoke execute on function public.reportar_posicao_incorreta(bigint, jsonb, text) from public;
revoke execute on function public.carta_publica_dados(uuid) from public;
revoke execute on function public.carta_publica_toggle(uuid, bigint, text) from public;
revoke execute on function public.territorio_publico(uuid) from public;
grant execute on function public.auto_vincular_enderecos(), public.criar_tce(text, text, bigint[]),
  public.salvar_quadra_poligono(text, jsonb, text, text, boolean), public.quadras_join(text[]),
  public.dividir_quadra(text, jsonb, text), public.reportar_posicao_incorreta(bigint, jsonb, text)
  to authenticated;
grant execute on function public.buscar_locais_proximos(double precision, double precision, integer, integer) to authenticated;
grant execute on function public.carta_publica_dados(uuid), public.carta_publica_toggle(uuid, bigint, text),
  public.territorio_publico(uuid) to anon, authenticated;
