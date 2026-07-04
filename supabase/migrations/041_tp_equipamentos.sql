-- ============================================================================
-- 041_tp_equipamentos.sql — TP completo, incremento TP-A: equipamentos.
-- Carrinhos têm um TIPO; cada tipo tem um catálogo de PEÇAS (físicas +
-- literatura) — o seed vem do PDF do usuário que define os tipos/peças.
-- Também adianta as duas colunas de tp_pontos usadas no TP-E (solicitar
-- ponto pendente pelo publicador), pra não abrir migration só pra isso.
-- Padrão de RLS: leitura authenticated, escrita is_admin() (mesmo da 036).
-- ============================================================================

create table if not exists tp_carrinho_tipos (
  id bigserial primary key,
  nome text not null,                 -- "Carrinho padrão", "Display de mesa"
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Checklist de peças POR TIPO. `categoria` separa parte física de
-- literatura; literatura pode (opcionalmente) apontar pra uma publicacao
-- do catálogo, pra ligar reposição ↔ suprimento de campanha.
create table if not exists tp_pecas_catalogo (
  id bigserial primary key,
  tipo_id bigint not null references tp_carrinho_tipos(id) on delete cascade,
  nome text not null,                 -- "Roda dianteira", "Lona", "Sentinela"
  categoria text not null check (categoria in ('fisica','literatura')),
  publicacao_id bigint references publicacoes(id) on delete set null,
  ordem int not null default 0,
  ativo boolean not null default true
);
create index if not exists tp_pecas_catalogo_tipo_idx on tp_pecas_catalogo(tipo_id);

create table if not exists tp_carrinhos (
  id bigserial primary key,
  nome text not null,                 -- "Carrinho 1", "Carrinho 2 — Damião"
  tipo_id bigint not null references tp_carrinho_tipos(id) on delete restrict,
  guardado_em text,                   -- onde fica guardado (Salão, casa do irmão X)
  custodia_id uuid references profiles(id) on delete set null,  -- com quem está
  status text not null default 'disponivel'
    check (status in ('disponivel','manutencao','aposentado')),
  notas text,
  criado_em timestamptz not null default now()
);

-- Colunas já pro TP-E (ponto sugerido pelo publicador → validação admin,
-- mesmo padrão de locais.pendente na migration 028).
alter table tp_pontos add column if not exists pendente boolean not null default false;
alter table tp_pontos add column if not exists criado_por uuid references profiles(id) on delete set null;

alter table tp_carrinho_tipos enable row level security;
alter table tp_pecas_catalogo enable row level security;
alter table tp_carrinhos enable row level security;

drop policy if exists tp_carrinho_tipos_select on tp_carrinho_tipos;
create policy tp_carrinho_tipos_select on tp_carrinho_tipos for select using (auth.uid() is not null);
drop policy if exists tp_carrinho_tipos_admin on tp_carrinho_tipos;
create policy tp_carrinho_tipos_admin on tp_carrinho_tipos for all using (is_admin()) with check (is_admin());

drop policy if exists tp_pecas_catalogo_select on tp_pecas_catalogo;
create policy tp_pecas_catalogo_select on tp_pecas_catalogo for select using (auth.uid() is not null);
drop policy if exists tp_pecas_catalogo_admin on tp_pecas_catalogo;
create policy tp_pecas_catalogo_admin on tp_pecas_catalogo for all using (is_admin()) with check (is_admin());

drop policy if exists tp_carrinhos_select on tp_carrinhos;
create policy tp_carrinhos_select on tp_carrinhos for select using (auth.uid() is not null);
drop policy if exists tp_carrinhos_admin on tp_carrinhos;
create policy tp_carrinhos_admin on tp_carrinhos for all using (is_admin()) with check (is_admin());

-- TP-E: publicador pode SUGERIR um ponto — insere só se for pendente,
-- inativo e criado por ele mesmo. Combina por OR com a policy de admin da
-- migration 036 (admin insere direto; publicador só pendente). Admin valida
-- depois em /admin/tp (ativa ou apaga), mesmo padrão de locais.pendente.
drop policy if exists tp_pontos_sugerir on tp_pontos;
create policy tp_pontos_sugerir on tp_pontos for insert
  with check (pendente = true and ativo = false and criado_por = auth.uid());
