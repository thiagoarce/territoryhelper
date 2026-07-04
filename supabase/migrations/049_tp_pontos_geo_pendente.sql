-- ============================================================================
-- 049_tp_pontos_geo_pendente.sql — TP completo, incremento TP-E: expõe
-- `pendente`/`criado_por` (colunas já existentes desde a 041) na view
-- tp_pontos_geo. A view foi criada na 036, antes dessas colunas
-- existirem — sem isso o admin não enxerga quais pontos vieram de
-- sugestão do publicador.
--
-- CREATE OR REPLACE VIEW só aceita coluna nova no FINAL da lista do
-- SELECT (ver CLAUDE.md) — por isso pendente/criado_por vêm depois de
-- geo_geojson, não intercaladas com as colunas originais.
-- ============================================================================

create or replace view tp_pontos_geo
with (security_invoker = on)
as
select
  id, nome, endereco, notas, ativo, criado_em,
  ST_AsGeoJSON(geo)::jsonb as geo_geojson,
  pendente, criado_por
from tp_pontos;
