-- 091: pontos de referência NOMEADOS pela congregação.
--
-- Motivo (queixa real): dirigente e publicador abrem o mapa e não sabem
-- onde aquilo fica. O nome que todo mundo usa não está em lugar nenhum
-- do sistema — "é no Banco do Brasil da Fernando", "estaciona na frente
-- da padaria". O OSM tem o ponto, mas com o nome oficial (ou sem nome).
-- Aqui fica o APELIDO da congregação, que vale mais em campo.
--
-- Mesmo desenho de tp_pontos (036/041/049): tabela + view *_geo com
-- security_invoker + RLS. Escrita é de dirigente/admin — NÃO existe
-- policy de "sugestão do publicador" (tp_pontos_sugerir) porque nesta
-- rodada o usuário decidiu não ter fila de aprovação.

create table if not exists pontos_referencia (
  id bigserial primary key,
  nome text not null,
  tipo text not null default 'referencia'
    check (tipo in ('estacionamento', 'referencia', 'entrada', 'atencao')),
  geo geometry(Point, 4326) not null,
  notas text,
  -- vínculo OPCIONAL: o ponto pode ser da quadra, do território, ou
  -- solto (um ponto de encontro que serve pra vários territórios)
  quadra_id text references quadras(id) on delete set null,
  territorio_id text references territorios(id) on delete set null,
  -- 'node/123' | 'way/456' quando nasceu de um POI do OSM salvo com
  -- nosso apelido — evita salvar o mesmo lugar duas vezes
  osm_id text,
  ativo boolean not null default true,
  criado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists pontos_referencia_geo_gist on pontos_referencia using gist(geo);
create index if not exists pontos_referencia_quadra_idx on pontos_referencia(quadra_id);
create index if not exists pontos_referencia_territorio_idx on pontos_referencia(territorio_id);
-- Parcial: só quando veio do OSM. Sem o `where`, todos os pontos
-- criados na mão (osm_id null) colidiriam entre si em alguns bancos.
create unique index if not exists pontos_referencia_osm_uniq
  on pontos_referencia(osm_id) where osm_id is not null;

alter table pontos_referencia enable row level security;

drop policy if exists pr_select_auth on pontos_referencia;
create policy pr_select_auth on pontos_referencia
  for select to authenticated using (true);

drop policy if exists pr_write_dirigente on pontos_referencia;
create policy pr_write_dirigente on pontos_referencia
  for all to authenticated
  using (is_dirigente_or_admin()) with check (is_dirigente_or_admin());

-- View com a geometria em GeoJSON (padrão de quadras_geo/locais_geo/
-- tp_pontos_geo). Lembrete da casa: `create or replace view` só aceita
-- coluna NOVA no FIM da lista — nunca inserir no meio.
create or replace view pontos_referencia_geo
with (security_invoker = on)
as
select
  id, nome, tipo, notas, quadra_id, territorio_id, osm_id,
  ativo, criado_por, criado_em,
  ST_AsGeoJSON(geo)::jsonb as geo_geojson
from pontos_referencia;

grant select on pontos_referencia_geo to authenticated;
