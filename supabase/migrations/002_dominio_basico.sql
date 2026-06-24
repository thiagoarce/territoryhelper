-- ============================================================================
-- 002_dominio_basico.sql
-- Schema das tabelas principais do domínio (espelha o app antigo, com FKs
-- reais e índices). Migração faseada — começa só com o necessário pra um
-- spike funcional. Detalhamento de cada tabela acontece nas migrations
-- seguintes conforme vamos portando features.
-- ============================================================================

-- Territórios agrupam quadras
create table territorios (
  id text primary key,
  nome text not null,
  cor text not null default '#3388ff',
  ids_quadras text[] not null default '{}',
  poly_string text,
  label_pos jsonb,
  label_type text,
  status text not null default 'pendente',
  data_conclusao date,
  criado_em timestamptz not null default now()
);

-- Quadras: polígono + status + cor
create table quadras (
  id text primary key,
  poly_string text not null,
  color text not null default '#3388ff',
  territorio_id text references territorios(id) on delete set null,
  status text not null default 'pendente',
  data_conclusao date,
  criado_em timestamptz not null default now()
);

create index quadras_territorio_idx on quadras(territorio_id);
create index quadras_status_idx on quadras(status);

-- Endereços (Dados Brutos no app antigo)
create table enderecos (
  id bigserial primary key,
  quadra_id text references quadras(id) on delete set null,
  setor text,
  quadra_ibge text,
  face_ibge text,
  logradouro text not null,
  numero text not null,
  complemento text,
  lat double precision,
  lng double precision,
  tipo text,
  nome text,
  nota text,
  nao_visitar boolean not null default false,
  ordem integer,
  criado_em timestamptz not null default now()
);

create index enderecos_quadra_idx on enderecos(quadra_id);
create index enderecos_predio_idx on enderecos(logradouro, numero);
create index enderecos_face_idx on enderecos(quadra_id, face_ibge);

-- Designações: quem trabalha quais quadras
create table designacoes (
  id bigserial primary key,
  publicador_id uuid references profiles(id) on delete cascade,
  quadras_ids text[] not null,
  criada_em timestamptz not null default now(),
  prazo date,
  status text not null default 'aberta',  -- aberta | concluida | cancelada
  notas text
);

create index designacoes_publicador_idx on designacoes(publicador_id);
create index designacoes_status_idx on designacoes(status);

-- ============================================================================
-- RLS básico — só leitura por authenticated; writes restritos a admin
-- (refinamos quando portar features que precisam de publicador/dirigente writes).
-- ============================================================================
alter table territorios enable row level security;
alter table quadras enable row level security;
alter table enderecos enable row level security;
alter table designacoes enable row level security;

create policy "territorios_read" on territorios for select to authenticated using (true);
create policy "territorios_admin_write" on territorios for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "quadras_read" on quadras for select to authenticated using (true);
create policy "quadras_admin_write" on quadras for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "enderecos_read" on enderecos for select to authenticated using (true);
create policy "enderecos_admin_write" on enderecos for all to authenticated
  using (is_admin()) with check (is_admin());

-- Designações: admin vê tudo, publicador vê só as próprias.
create policy "designacoes_admin_all" on designacoes for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "designacoes_publicador_propria" on designacoes for select to authenticated
  using (publicador_id = auth.uid());
