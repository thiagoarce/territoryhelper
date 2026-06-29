-- Simplifica o conceito de status em quadras: o que importa é só ativa/inativa.
-- "concluido / pendente" são derivados (concluido = tem data_conclusao,
-- pendente = ativa sem data). Manter os 3 valores em 'status' duplicava info
-- e podia ficar inconsistente.

alter table quadras add column if not exists ativa boolean not null default true;
update quadras set ativa = false where status = 'inativa';
create index if not exists quadras_ativa_idx on quadras(ativa);

-- A view quadras_geo precisa ser recriada pra incluir a coluna 'ativa'
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
  ST_AsGeoJSON(poly)::jsonb as poly_geojson
from quadras;

grant select on quadras_geo to authenticated;

-- 'status' fica deprecado mas mantido por enquanto pra não quebrar imports antigos.
-- Próxima migration (depois do app estar 100% no ativa) pode dropar.
