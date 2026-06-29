-- ============================================================================
-- 012_geojson_views.sql
-- Views que expõem geometrias PostGIS como GeoJSON (consumível direto
-- pelo Leaflet no frontend).
-- security_invoker = on garante que RLS da tabela base é aplicada.
-- ============================================================================

create or replace view quadras_geo
with (security_invoker = on)
as
select
  id,
  color,
  territorio_id,
  status,
  data_conclusao,
  notas,
  criado_em,
  atualizado_em,
  ST_AsGeoJSON(poly)::jsonb as poly_geojson
from quadras;

create or replace view locais_geo
with (security_invoker = on)
as
select
  l.*,
  case
    when l.geo is not null then ST_AsGeoJSON(l.geo)::jsonb
    else null
  end as geo_geojson
from locais l;

create or replace view tces_geo
with (security_invoker = on)
as
select
  t.*,
  case
    when t.poly is not null then ST_AsGeoJSON(t.poly)::jsonb
    else null
  end as poly_geojson
from tces t;

-- Permite read pra authenticated nas views
grant select on quadras_geo, locais_geo, tces_geo to authenticated;
