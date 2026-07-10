-- 078 (E1): `contexto` no territorio_publico — dados pro Cartão de Mapa
-- de Território (formato S-12). O cartão mostra TODAS as quadras ativas
-- dos territórios afetados pelas quadras do token (não só as do token),
-- coloridas no cliente: cinza = disponível, vermelho+X = concluída há
-- pouco, destaque = as do próprio token. Também devolve os territórios
-- ({id, nome}) pro "Terr. N.º". Token sem quadra (só TCE/cartas) devolve
-- contexto com arrays vazios — a UI esconde o cartão nesse caso.
--
-- Exposição consciente: o link público passa a revelar geometria +
-- data_conclusao das quadras VIZINHAS do mesmo território (mesma
-- natureza do que o link já mostra; sem dados pessoais).
create or replace function territorio_publico(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  t record;
  resultado jsonb;
begin
  select * into t from territorio_tokens
    where token = p_token and (expira_em is null or expira_em > now());
  if not found then
    return null;
  end if;

  if t.arranjo_id is not null then
    select jsonb_build_object(
      'tipo', 'arranjo',
      'titulo', coalesce(a.nome, 'Arranjo'),
      'data', a.data,
      'hora_inicio', a.hora_inicio,
      'local_endereco', a.local_endereco,
      'notas', a.notas,
      'quadras', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'color', q.color,
          'poly_geojson', ST_AsGeoJSON(q.poly)::jsonb)), '[]'::jsonb)
        from quadras q where q.id = any(coalesce(a.quadras_ids, '{}'))
      ),
      'predios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', l.id, 'nome', l.nome, 'logradouro', l.logradouro,
          'numero', l.numero,
          'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb)), '[]'::jsonb)
        from locais l where l.id = any(coalesce(a.cartas_locais_ids, '{}'))
      ),
      'tces', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', tc.id, 'nome', tc.nome,
          'poly_geojson', ST_AsGeoJSON(tc.poly)::jsonb)), '[]'::jsonb)
        from tces tc where tc.id = any(coalesce(a.tces_ids, '{}'))
      ),
      'contexto', jsonb_build_object(
        'territorios', coalesce((
          select jsonb_agg(jsonb_build_object('id', tr.id, 'nome', tr.nome) order by tr.id)
          from territorios tr
          where tr.id in (
            select distinct q2.territorio_id from quadras q2
            where q2.id = any(coalesce(a.quadras_ids, '{}')) and q2.territorio_id is not null
          )
        ), '[]'::jsonb),
        'quadras', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', qq.id, 'territorio_id', qq.territorio_id,
            'data_conclusao', qq.data_conclusao,
            'poly_geojson', ST_AsGeoJSON(qq.poly)::jsonb))
          from quadras qq
          where qq.ativa and qq.territorio_id in (
            select distinct q2.territorio_id from quadras q2
            where q2.id = any(coalesce(a.quadras_ids, '{}')) and q2.territorio_id is not null
          )
        ), '[]'::jsonb)
      )
    ) into resultado
    from arranjos a where a.id = t.arranjo_id;
  else
    select jsonb_build_object(
      'tipo', 'designacao',
      'titulo', coalesce(p.nome, 'Território pessoal'),
      'prazo', d.prazo,
      'notas', d.notas,
      'quadras', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'color', q.color,
          'poly_geojson', ST_AsGeoJSON(q.poly)::jsonb)), '[]'::jsonb)
        from designacao_quadras dq
        join quadras q on q.id = dq.quadra_id
        where dq.designacao_id = d.id
      ),
      'predios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', l.id, 'nome', l.nome, 'logradouro', l.logradouro,
          'numero', l.numero,
          'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb)), '[]'::jsonb)
        from designacao_locais dl
        join locais l on l.id = dl.local_id
        where dl.designacao_id = d.id
      ),
      'contexto', jsonb_build_object(
        'territorios', coalesce((
          select jsonb_agg(jsonb_build_object('id', tr.id, 'nome', tr.nome) order by tr.id)
          from territorios tr
          where tr.id in (
            select distinct q2.territorio_id
            from designacao_quadras dq2
            join quadras q2 on q2.id = dq2.quadra_id
            where dq2.designacao_id = d.id and q2.territorio_id is not null
          )
        ), '[]'::jsonb),
        'quadras', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', qq.id, 'territorio_id', qq.territorio_id,
            'data_conclusao', qq.data_conclusao,
            'poly_geojson', ST_AsGeoJSON(qq.poly)::jsonb))
          from quadras qq
          where qq.ativa and qq.territorio_id in (
            select distinct q2.territorio_id
            from designacao_quadras dq2
            join quadras q2 on q2.id = dq2.quadra_id
            where dq2.designacao_id = d.id and q2.territorio_id is not null
          )
        ), '[]'::jsonb)
      )
    ) into resultado
    from designacoes d
    left join profiles p on p.id = d.publicador_id
    where d.id = t.designacao_id;
  end if;

  return resultado;
end;
$$;
