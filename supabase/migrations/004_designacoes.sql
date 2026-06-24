-- ============================================================================
-- 004_designacoes.sql — Domínio 3: quem trabalha o quê
-- Designações de quadras (junção em vez de array text[]) e TCEs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Designações: território pessoal — publicador X recebe quadras [A, B, C]
-- ----------------------------------------------------------------------------
create table designacoes (
  id bigserial primary key,
  publicador_id uuid references profiles(id) on delete set null,
  criada_em timestamptz not null default now(),
  prazo date,
  status text not null default 'aberta',     -- aberta | concluida | cancelada
  notas text,
  criado_por uuid references profiles(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

create index designacoes_publicador_idx on designacoes(publicador_id);
create index designacoes_status_idx on designacoes(status);

-- Junção N-N: substitui o text[] de quadras_ids. JOIN trivial + FK validada.
create table designacao_quadras (
  designacao_id bigint not null references designacoes(id) on delete cascade,
  quadra_id text not null references quadras(id) on delete cascade,
  primary key (designacao_id, quadra_id)
);

create index designacao_quadras_quadra_idx on designacao_quadras(quadra_id);

-- ----------------------------------------------------------------------------
-- TCE = Território Comercial Especial.
-- Atravessa fronteiras de quadras: agrupa unidades comerciais de quadras
-- diferentes em um território próprio com ciclo próprio.
-- ----------------------------------------------------------------------------
create table tces (
  id text primary key,
  nome text not null,
  tipo text not null default 'comercial',    -- comercial (futuro: rural, telefone…)
  poly geometry(Polygon, 4326),              -- convex hull dos pontos
  publicador_id uuid references profiles(id) on delete set null,
  prazo date,
  status text not null default 'aberto',     -- aberto | concluido | cancelado
  criado_em timestamptz not null default now(),
  data_conclusao date,
  notas text,
  atualizado_em timestamptz not null default now()
);

create index tces_status_idx on tces(status);
create index tces_publicador_idx on tces(publicador_id);
create index tces_poly_gist on tces using gist(poly);

-- Junção N-N: substitui endereco_ids bigint[]. FK valida que a unidade existe.
create table tce_unidades (
  tce_id text not null references tces(id) on delete cascade,
  unidade_id bigint not null references unidades(id) on delete cascade,
  primary key (tce_id, unidade_id)
);

create index tce_unidades_unidade_idx on tce_unidades(unidade_id);
