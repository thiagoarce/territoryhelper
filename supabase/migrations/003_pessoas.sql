-- ============================================================================
-- 003_pessoas.sql — Domínio 2: quem usa o app
-- Convites (admin gera link, irmão define senha) + arranjos de cartas.
-- profiles já foi criado em 001_profiles_and_auth.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Convites: admin cria, irmão usa o token pra definir email+senha
-- ----------------------------------------------------------------------------
create table convites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nome text not null,
  role role_usuario not null default 'publicador',
  token uuid not null default gen_random_uuid() unique,
  criado_por uuid references profiles(id) on delete set null,
  expira_em timestamptz not null default (now() + interval '14 days'),
  usado_em timestamptz,
  usado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index convites_token_idx on convites(token) where usado_em is null;
create index convites_email_idx on convites(email);

-- ----------------------------------------------------------------------------
-- Arranjos: grupo de publicadores que trabalham cartas juntos.
-- Quando alguém do arranjo marca carta entregue, todos veem em tempo real.
-- ----------------------------------------------------------------------------
create table arranjos (
  id bigserial primary key,
  nome text not null,
  descricao text,
  lider_id uuid references profiles(id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table arranjo_membros (
  arranjo_id bigint not null references arranjos(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  entrou_em timestamptz not null default now(),
  primary key (arranjo_id, profile_id)
);

create index arranjo_membros_profile_idx on arranjo_membros(profile_id);
