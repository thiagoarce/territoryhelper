-- T18 (A12c): reposição por carrinho — inventário do que TEM em cada
-- carrinho/equipamento (item + qtd), pra a seção Reposição de
-- /publicacoes virar "um card por carrinho" em vez de lista plana.
-- Item pode ser de literatura (aponta pra publicacoes) ou físico
-- (descricao livre) — mesmo padrão categoria de tp_pecas_catalogo.

create table if not exists tp_carrinho_inventario (
  id bigserial primary key,
  carrinho_id bigint not null references tp_carrinhos(id) on delete cascade,
  publicacao_id bigint references publicacoes(id) on delete set null,
  descricao text,
  qtd int not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references profiles(id) on delete set null,
  check (publicacao_id is not null or descricao is not null)
);
create index if not exists tp_carrinho_inventario_carrinho_idx on tp_carrinho_inventario(carrinho_id);

alter table tp_carrinho_inventario enable row level security;

drop policy if exists tp_carrinho_inventario_select on tp_carrinho_inventario;
create policy tp_carrinho_inventario_select on tp_carrinho_inventario for select using (auth.uid() is not null);
drop policy if exists tp_carrinho_inventario_admin on tp_carrinho_inventario;
create policy tp_carrinho_inventario_admin on tp_carrinho_inventario for all using (is_admin()) with check (is_admin());
