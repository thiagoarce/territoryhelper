-- ============================================================================
-- 037_publicacoes.sql — Publicações (suprimento de campanha), incremento P1.
-- Escopo v1 deliberadamente pequeno: checklist de suprimento por campanha,
-- não um estoque geral da congregação.
-- ============================================================================

create table if not exists publicacoes (
  id bigserial primary key,
  nome text not null,
  codigo text,
  ativo boolean not null default true
);

create table if not exists campanha_suprimentos (
  id bigserial primary key,
  campanha_id bigint not null references campanhas(id) on delete cascade,
  publicacao_id bigint not null references publicacoes(id) on delete restrict,
  qtd_necessaria int not null default 0,
  qtd_em_maos int not null default 0,
  pedido_feito boolean not null default false,
  notas text
);

create index if not exists campanha_suprimentos_campanha_idx on campanha_suprimentos(campanha_id);

-- Vínculo campanha → publicação principal da campanha (specs 1.6)
alter table campanhas add column if not exists publicacao_id bigint references publicacoes(id) on delete set null;

alter table publicacoes enable row level security;
alter table campanha_suprimentos enable row level security;

drop policy if exists publicacoes_select on publicacoes;
create policy publicacoes_select on publicacoes for select using (auth.uid() is not null);
drop policy if exists publicacoes_admin_write on publicacoes;
create policy publicacoes_admin_write on publicacoes for all using (is_admin()) with check (is_admin());

drop policy if exists campanha_suprimentos_select on campanha_suprimentos;
create policy campanha_suprimentos_select on campanha_suprimentos for select using (auth.uid() is not null);
drop policy if exists campanha_suprimentos_admin_write on campanha_suprimentos;
create policy campanha_suprimentos_admin_write on campanha_suprimentos for all using (is_admin()) with check (is_admin());
