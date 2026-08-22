-- 094: pontos de referência viram catálogo GLOBAL, gerido pelo admin.
--
-- O que mudou (decisão do usuário depois de usar a primeira versão):
--   1. "Um local de saída pode estar associado a UM OU MAIS territórios
--      — encontro de territórios normalmente tem um local de encontro
--      bom". O vínculo 1:1 (coluna territorio_id) não dá conta: vira N:N.
--   2. Cadastro sai da tela da quadra (é característica GLOBAL, não da
--      quadra) e passa a viver em /admin/poligonos, aba própria.
--   3. Dirigente PERDE a criação direta e passa a SUGERIR — o admin
--      valida. Mesmo desenho de tp_pontos_sugerir (migration 041).
--   4. Link do Google Maps guardado no ponto: dá pra mandar no WhatsApp
--      exatamente o link que a congregação já conhece.

alter table pontos_referencia add column if not exists status text not null default 'validado';
do $$ begin
  alter table pontos_referencia add constraint pontos_referencia_status_check
    check (status in ('sugerido', 'validado')) not valid;
exception when duplicate_object then null;
end $$;

-- Link do Maps (o curto goo.gl ou o longo) — quando existe, é ele que a
-- gente compartilha, em vez de montar um a partir da coordenada.
alter table pontos_referencia add column if not exists maps_url text;
-- Endereço textual que veio do link do Maps (ajuda a conferir o pino)
alter table pontos_referencia add column if not exists endereco text;

-- ── N:N com territórios ──────────────────────────────────────────────
create table if not exists ponto_referencia_territorios (
  ponto_id bigint not null references pontos_referencia(id) on delete cascade,
  territorio_id text not null references territorios(id) on delete cascade,
  primary key (ponto_id, territorio_id)
);
create index if not exists prt_territorio_idx on ponto_referencia_territorios(territorio_id);

-- Migra o vínculo antigo (coluna territorio_id) pra tabela nova. A
-- coluna fica como legado: não é mais lida nem escrita pelo app.
insert into ponto_referencia_territorios (ponto_id, territorio_id)
select id, territorio_id from pontos_referencia
where territorio_id is not null
on conflict do nothing;

alter table ponto_referencia_territorios enable row level security;

drop policy if exists prt_select_auth on ponto_referencia_territorios;
create policy prt_select_auth on ponto_referencia_territorios
  for select to authenticated using (true);

drop policy if exists prt_write_admin on ponto_referencia_territorios;
create policy prt_write_admin on ponto_referencia_territorios
  for all to authenticated using (is_admin()) with check (is_admin());

-- ── RLS de pontos_referencia: escrita volta pro admin ────────────────
-- A policy da 091 dava escrita completa a dirigente/admin. Agora o
-- dirigente só pode INSERIR SUGESTÃO (status='sugerido', ele como
-- autor) — quem valida, edita e apaga é o admin.
drop policy if exists pr_write_dirigente on pontos_referencia;

drop policy if exists pr_write_admin on pontos_referencia;
create policy pr_write_admin on pontos_referencia
  for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists pr_sugerir_dirigente on pontos_referencia;
create policy pr_sugerir_dirigente on pontos_referencia
  for insert to authenticated
  with check (
    is_dirigente_or_admin()
    and status = 'sugerido'
    and criado_por = auth.uid()
  );

-- View: acrescenta as colunas NOVAS no FIM (regra do create or replace
-- view — inserir no meio muda a posição das seguintes e o Postgres
-- rejeita).
create or replace view pontos_referencia_geo
with (security_invoker = on)
as
select
  id, nome, tipo, notas, quadra_id, territorio_id, osm_id,
  ativo, criado_por, criado_em,
  ST_AsGeoJSON(geo)::jsonb as geo_geojson,
  status, maps_url, endereco
from pontos_referencia;

grant select on pontos_referencia_geo to authenticated;
