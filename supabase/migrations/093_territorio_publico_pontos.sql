-- 093: o link público /t/<token> passa a mostrar os PONTOS DE
-- REFERÊNCIA da congregação (migration 091) — "Banco do Brasil da
-- Fernando", "estaciona na frente da padaria".
--
-- Sem isso, quem recebe o link no WhatsApp vê o polígono mas não o
-- ponto de encontro, que é justamente o que a pessoa precisa pra
-- chegar. A tela usa esses pontos também pra sugerir onde parar
-- (ver $lib/paradas.ts) sem depender da Overpass.
--
-- Reescreve a função INTEIRA a partir da versão da 082 (não dá pra
-- "adicionar um campo" numa function) acrescentando a chave 'pontos'
-- nos DOIS branches (arranjo e designação). É jsonb, então chave nova
-- não quebra cliente antigo — diferente de view, onde a coluna nova
-- teria que ir no fim.
--
-- Critério do que entra: ponto ativo ligado à quadra/território do
-- token, OU a até 300m da união dos polígonos (mesmo padrão de
-- ST_DWithin em geography que a 080 usa pras quadras vizinhas) — um
-- ponto de encontro costuma ficar FORA do território, na esquina.

create or replace function territorio_publico(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  t record;
  resultado jsonb;
  raio_vizinhas_m constant integer := 250;
  raio_pontos_m constant integer := 300;
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
      'tce_comercios', (
        select coalesce(jsonb_agg(distinct jsonb_build_object(
          'id', l.id, 'nome', l.nome, 'logradouro', l.logradouro,
          'numero', l.numero,
          'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb)), '[]'::jsonb)
        from tce_unidades tu
        join unidades u on u.id = tu.unidade_id
        join locais l on l.id = u.local_id
        where tu.tce_id = any(coalesce(a.tces_ids, '{}')) and l.geo is not null
      ),
      'pontos', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pr.id, 'nome', pr.nome, 'tipo', pr.tipo, 'notas', pr.notas,
          'geo_geojson', ST_AsGeoJSON(pr.geo)::jsonb)), '[]'::jsonb)
        from pontos_referencia pr
        where pr.ativo
          and (
            pr.quadra_id = any(coalesce(a.quadras_ids, '{}'))
            or pr.territorio_id in (
              select distinct q2.territorio_id from quadras q2
              where q2.id = any(coalesce(a.quadras_ids, '{}')) and q2.territorio_id is not null
            )
            or ST_DWithin(
              pr.geo::geography,
              (select ST_Union(q3.poly) from quadras q3 where q3.id = any(coalesce(a.quadras_ids, '{}')))::geography,
              raio_pontos_m
            )
          )
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
          where qq.ativa and (
            qq.territorio_id in (
              select distinct q2.territorio_id from quadras q2
              where q2.id = any(coalesce(a.quadras_ids, '{}')) and q2.territorio_id is not null
            )
            or ST_DWithin(
              qq.poly::geography,
              (select ST_Union(q3.poly) from quadras q3 where q3.id = any(coalesce(a.quadras_ids, '{}')))::geography,
              raio_vizinhas_m
            )
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
      'tces', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', tc.id, 'nome', tc.nome,
          'poly_geojson', ST_AsGeoJSON(tc.poly)::jsonb)), '[]'::jsonb)
        from designacao_tces dt
        join tces tc on tc.id = dt.tce_id
        where dt.designacao_id = d.id
      ),
      'tce_comercios', (
        select coalesce(jsonb_agg(distinct jsonb_build_object(
          'id', l.id, 'nome', l.nome, 'logradouro', l.logradouro,
          'numero', l.numero,
          'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb)), '[]'::jsonb)
        from designacao_tces dt
        join tce_unidades tu on tu.tce_id = dt.tce_id
        join unidades u on u.id = tu.unidade_id
        join locais l on l.id = u.local_id
        where dt.designacao_id = d.id and l.geo is not null
      ),
      'pontos', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pr.id, 'nome', pr.nome, 'tipo', pr.tipo, 'notas', pr.notas,
          'geo_geojson', ST_AsGeoJSON(pr.geo)::jsonb)), '[]'::jsonb)
        from pontos_referencia pr
        where pr.ativo
          and (
            pr.quadra_id in (select dq3.quadra_id from designacao_quadras dq3 where dq3.designacao_id = d.id)
            or pr.territorio_id in (
              select distinct q2.territorio_id
              from designacao_quadras dq2
              join quadras q2 on q2.id = dq2.quadra_id
              where dq2.designacao_id = d.id and q2.territorio_id is not null
            )
            or ST_DWithin(
              pr.geo::geography,
              (select ST_Union(q3.poly) from designacao_quadras dq3
                join quadras q3 on q3.id = dq3.quadra_id
                where dq3.designacao_id = d.id)::geography,
              raio_pontos_m
            )
          )
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
          where qq.ativa and (
            qq.territorio_id in (
              select distinct q2.territorio_id
              from designacao_quadras dq2
              join quadras q2 on q2.id = dq2.quadra_id
              where dq2.designacao_id = d.id and q2.territorio_id is not null
            )
            or ST_DWithin(
              qq.poly::geography,
              (select ST_Union(q3.poly)
                from designacao_quadras dq3
                join quadras q3 on q3.id = dq3.quadra_id
                where dq3.designacao_id = d.id)::geography,
              raio_vizinhas_m
            )
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
