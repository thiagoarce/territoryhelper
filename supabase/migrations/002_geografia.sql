-- ============================================================================
-- 002_geografia.sql — Domínio 1: organização física do território
-- territorios → quadras → locais → unidades
-- Usa PostGIS pra polígonos (qual quadra contém esse ponto?) em ms via GiST.
-- ============================================================================

create extension if not exists postgis;

-- ----------------------------------------------------------------------------
-- Enum: tipo de local físico
-- ----------------------------------------------------------------------------
create type local_tipo as enum (
  'predio',     -- edifício com aptos
  'casa',       -- residência única (com ou sem fundos)
  'comercio',   -- estabelecimento comercial
  'coletivo',   -- domicílio coletivo (alojamento, asilo, hostel...)
  'terreno'     -- lote vazio / esconde da lista padrão
);

-- ----------------------------------------------------------------------------
-- Territórios: agrupador lógico de quadras
-- ----------------------------------------------------------------------------
create table territorios (
  id text primary key,                       -- ex: "T-01", nome curto
  nome text not null,
  cor text not null default '#3388ff',
  label_pos jsonb,                           -- {lat, lng} pra label no mapa
  label_type text,                           -- 'point' | 'center'
  status text not null default 'pendente',   -- pendente | concluido | inativa
  data_conclusao date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Quadras: polígonos do território. PostGIS pra geometria nativa.
-- ----------------------------------------------------------------------------
create table quadras (
  id text primary key,                       -- ex: "33A", "Q-1"
  poly geometry(Polygon, 4326) not null,     -- SRID 4326 = WGS84 (lat/lng)
  color text not null default '#3388ff',
  territorio_id text references territorios(id) on delete set null,
  status text not null default 'pendente',
  data_conclusao date,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index quadras_territorio_idx on quadras(territorio_id);
create index quadras_status_idx on quadras(status);
create index quadras_poly_gist on quadras using gist(poly);  -- spatial index

-- ----------------------------------------------------------------------------
-- Locais: entidade física (prédio, casa, comércio…)
-- Atributos do "endereço" enquanto LUGAR (lat/lng/nome/portaria) ficam aqui.
-- O que se VISITA (aptos individuais) fica em `unidades`.
-- ----------------------------------------------------------------------------
create table locais (
  id bigserial primary key,
  tipo local_tipo not null,
  logradouro text not null,
  numero text not null,
  geo geometry(Point, 4326),                 -- lat/lng = ST_Y(geo), ST_X(geo)
  quadra_id text references quadras(id) on delete set null,
  setor text,
  quadra_ibge text,
  face_ibge text,
  -- Atributos do local
  nome text,                                 -- "Edif. Solar", "Casa da esquina"
  irmao_mora boolean not null default false,
  nome_irmao text,
  notas text,
  foto_url text,                             -- nova feature: foto do local
  tipo_entrada text,                         -- porteiro | eletronica | sem
  acesso_caixas boolean not null default false,
  acesso_interfones boolean not null default false,
  nao_visitar boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references profiles(id) on delete set null,
  unique (logradouro, numero, quadra_id)     -- evita duplicata dentro da quadra
);

create index locais_quadra_idx on locais(quadra_id);
create index locais_tipo_idx on locais(tipo);
create index locais_geo_gist on locais using gist(geo);  -- spatial
create index locais_log_num_idx on locais(logradouro, numero);

-- ----------------------------------------------------------------------------
-- Unidades: o que o publicador visita.
-- Casa única → 1 unidade sem complemento. Prédio → N unidades (1 por apto).
-- ----------------------------------------------------------------------------
create table unidades (
  id bigserial primary key,
  local_id bigint not null references locais(id) on delete cascade,
  complemento text,                          -- "APT 101", "Sala 2", null pra casa única
  ordem integer,                             -- ordem manual de visita
  desocupado boolean not null default false,
  nao_escrever boolean not null default false,
  carta_escrita date,
  carta_entregue date,
  nota text,                                 -- nota per-unidade (diferente de locais.notas)
  legacy_row integer unique,                 -- preserva row do Sheets pra migração (pode dropar depois)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index unidades_local_idx on unidades(local_id);
create index unidades_legacy_row_idx on unidades(legacy_row);
