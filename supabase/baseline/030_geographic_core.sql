do $$ begin
  create type public.local_tipo as enum ('predio', 'casa', 'comercio', 'coletivo', 'terreno');
exception when duplicate_object then null;
end $$;

create table if not exists public.territorios (
  id text primary key,
  nome text not null,
  cor text not null default '#3388ff',
  label_pos jsonb,
  label_type text,
  status text not null default 'pendente',
  data_conclusao date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.territorio_limites (
  territorio_id text primary key references public.territorios(id) on delete cascade,
  geometria geometry(MultiPolygon, 4326) not null,
  source_hash text,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.quadras (
  id text primary key,
  poly geometry(Polygon, 4326) not null,
  color text not null default '#3388ff',
  territorio_id text references public.territorios(id) on delete set null,
  status text not null default 'pendente',
  ativa boolean not null default true,
  data_conclusao date,
  reservada_campanha_id bigint,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint quadras_poly_valido check (ST_IsValid(poly))
);

create table if not exists public.locais (
  id bigserial primary key,
  tipo public.local_tipo not null default 'casa',
  logradouro text not null,
  numero text not null,
  geo geometry(Point, 4326),
  quadra_id text references public.quadras(id) on delete set null,
  setor text,
  quadra_ibge text,
  face_ibge text,
  nome text,
  irmao_mora boolean not null default false,
  nome_irmao text,
  notas text,
  foto_url text,
  tipo_entrada text,
  acesso_caixas boolean not null default false,
  acesso_interfones boolean not null default false,
  nao_visitar boolean not null default false,
  nao_eh_predio boolean not null default false,
  pendente boolean not null default false,
  marcado_nao_existe boolean not null default false,
  marcado_por uuid references public.profiles(id) on delete set null,
  marcado_em timestamptz,
  ordem_na_quadra int,
  origem text not null default 'manual',
  origem_id text,
  origem_edicao text,
  origem_raw jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references public.profiles(id) on delete set null,
  unique (logradouro, numero, quadra_id),
  unique (origem, origem_id)
);

create table if not exists public.unidades (
  id bigserial primary key,
  local_id bigint not null references public.locais(id) on delete cascade,
  complemento text,
  ordem integer,
  desocupado boolean not null default false,
  nao_escrever boolean not null default false,
  carta_escrita date,
  carta_entregue date,
  carta_escrita_por uuid references public.profiles(id) on delete set null,
  nota text,
  legacy_row integer unique,
  origem text not null default 'manual',
  origem_id text,
  origem_raw jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (origem, origem_id)
);

create index if not exists territorio_limites_gist on public.territorio_limites using gist(geometria);
create index if not exists quadras_territorio_idx on public.quadras(territorio_id);
create index if not exists quadras_poly_gist on public.quadras using gist(poly);
create index if not exists locais_quadra_idx on public.locais(quadra_id);
create index if not exists locais_tipo_idx on public.locais(tipo);
create index if not exists locais_geo_gist on public.locais using gist(geo);
create index if not exists locais_log_num_idx on public.locais(logradouro, numero);
create index if not exists locais_pendente_idx on public.locais(pendente) where pendente;
create index if not exists unidades_local_idx on public.unidades(local_id);

drop trigger if exists bump_territorios on public.territorios;
create trigger bump_territorios before update on public.territorios for each row execute function public.bump_atualizado_em();
drop trigger if exists bump_quadras on public.quadras;
create trigger bump_quadras before update on public.quadras for each row execute function public.bump_atualizado_em();
drop trigger if exists bump_locais on public.locais;
create trigger bump_locais before update on public.locais for each row execute function public.bump_atualizado_em();
drop trigger if exists bump_unidades on public.unidades;
create trigger bump_unidades before update on public.unidades for each row execute function public.bump_atualizado_em();
