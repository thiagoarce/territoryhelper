-- ============================================================================
-- 034_reserva_campanha.sql — Campanhas v2, incremento C1: reserva de quadras
-- ("quarentena") pra chegar na campanha com território descansado.
-- Só quadra (não prédio/TCE) — caso real coberto, evita 3 junções.
-- ============================================================================

alter table quadras add column if not exists reservada_campanha_id
  bigint references campanhas(id) on delete set null;

create index if not exists quadras_reserva_idx on quadras(reservada_campanha_id)
  where reservada_campanha_id is not null;

-- view quadras_geo precisa expor a nova coluna. IMPORTANTE: CREATE OR
-- REPLACE VIEW só aceita adicionar colunas no FINAL da lista — a nova
-- coluna entra DEPOIS de poly_geojson (não antes), senão o Postgres
-- rejeita com "cannot change name of view column ... to ...".
create or replace view quadras_geo
with (security_invoker = on)
as
select
  id,
  color,
  territorio_id,
  status,
  ativa,
  data_conclusao,
  notas,
  criado_em,
  atualizado_em,
  ST_AsGeoJSON(poly)::jsonb as poly_geojson,
  reservada_campanha_id
from quadras;

grant select on quadras_geo to authenticated;
