-- ============================================================================
-- 036_testemunho_publico.sql — Testemunho Público (carrinhos), incremento
-- TP1: schema de pontos fixos + grade semanal de turnos + escala por data
-- concreta (permite faltar numa semana sem sair da grade e dá histórico real).
-- ============================================================================

create table if not exists tp_pontos (
  id bigserial primary key,
  nome text not null,
  endereco text,
  geo geometry(Point, 4326),
  notas text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists tp_turnos (
  id bigserial primary key,
  ponto_id bigint not null references tp_pontos(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  vagas int not null default 2,
  ativo boolean not null default true
);

create index if not exists tp_turnos_ponto_idx on tp_turnos(ponto_id);

-- Escala é POR DATA CONCRETA (não por turno abstrato): permite faltar
-- numa semana sem sair da grade e dá histórico real.
create table if not exists tp_escala (
  id bigserial primary key,
  turno_id bigint not null references tp_turnos(id) on delete cascade,
  data date not null,
  publicador_id uuid not null references profiles(id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (turno_id, data, publicador_id)
);

create index if not exists tp_escala_turno_data_idx on tp_escala(turno_id, data);
create index if not exists tp_escala_publicador_idx on tp_escala(publicador_id);

alter table tp_pontos enable row level security;
alter table tp_turnos enable row level security;
alter table tp_escala enable row level security;

drop policy if exists tp_pontos_select on tp_pontos;
create policy tp_pontos_select on tp_pontos for select using (auth.uid() is not null);
drop policy if exists tp_pontos_admin_write on tp_pontos;
create policy tp_pontos_admin_write on tp_pontos for all using (is_admin()) with check (is_admin());

drop policy if exists tp_turnos_select on tp_turnos;
create policy tp_turnos_select on tp_turnos for select using (auth.uid() is not null);
drop policy if exists tp_turnos_admin_write on tp_turnos;
create policy tp_turnos_admin_write on tp_turnos for all using (is_admin()) with check (is_admin());

drop policy if exists tp_escala_select on tp_escala;
create policy tp_escala_select on tp_escala for select using (auth.uid() is not null);
drop policy if exists tp_escala_insert on tp_escala;
create policy tp_escala_insert on tp_escala for insert
  with check (publicador_id = auth.uid() or is_admin());
drop policy if exists tp_escala_delete on tp_escala;
create policy tp_escala_delete on tp_escala for delete
  using (publicador_id = auth.uid() or is_admin());

-- View com geometria em GeoJSON (mesmo padrão de quadras_geo/locais_geo)
create or replace view tp_pontos_geo
with (security_invoker = on)
as
select
  id, nome, endereco, notas, ativo, criado_em,
  ST_AsGeoJSON(geo)::jsonb as geo_geojson
from tp_pontos;

grant select on tp_pontos_geo to authenticated;
