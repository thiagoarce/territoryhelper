-- Histórico de conclusões por quadra. Antes só guardávamos a última data em
-- quadras.data_conclusao — perdíamos rastro. Agora cada Concluir adiciona uma
-- linha; Reverter remove a última e o data_conclusao volta pra penúltima.

create table if not exists quadras_conclusoes (
  id bigserial primary key,
  quadra_id text not null references quadras(id) on delete cascade,
  data_conclusao date not null,
  marcado_por uuid references profiles(id) on delete set null,
  marcado_em timestamptz not null default now(),
  notas text
);

create index if not exists quadras_conclusoes_quadra_data_idx on quadras_conclusoes(quadra_id, data_conclusao desc);

alter table quadras_conclusoes enable row level security;

drop policy if exists qc_select_auth on quadras_conclusoes;
create policy qc_select_auth on quadras_conclusoes for select to authenticated using (true);

drop policy if exists qc_insert_auth on quadras_conclusoes;
create policy qc_insert_auth on quadras_conclusoes for insert to authenticated with check (true);

drop policy if exists qc_delete_admin on quadras_conclusoes;
create policy qc_delete_admin on quadras_conclusoes for delete using (is_admin());
