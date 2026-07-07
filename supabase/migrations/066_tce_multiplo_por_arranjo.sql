-- T24 (A21-f1): TCE fase 1 — arranjo passa a aceitar VÁRIOS TCEs em vez
-- de 1 único. Coluna legada `tce_id` é mantida no schema (não apagada,
-- FKs/dados antigos continuam válidos) mas o app para de lê-la/escrevê-la
-- a partir desta migration — a fonte de verdade passa a ser `tces_ids`.

alter table arranjos add column if not exists tces_ids text[] not null default '{}';

-- Backfill: migra o valor legado pra dentro do array novo (idempotente —
-- só roda se ainda não migrado).
update arranjos set tces_ids = array[tce_id]
  where tce_id is not null and not (tces_ids @> array[tce_id]);

-- territorio_publico: branch de arranjo passa a devolver "tces" (array)
-- em vez de "tce" (objeto único), lendo de tces_ids.
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
      )
    ) into resultado
    from designacoes d
    left join profiles p on p.id = d.publicador_id
    where d.id = t.designacao_id;
  end if;

  return resultado;
end;
$$;
