-- T20 (A18): metas pessoais do publicador dentro de uma campanha —
-- checklist livre que ele mesmo cria/marca/apaga (sem aprovação/fluxo,
-- mesmo espírito de publicador_necessidade_regular na migration 051).

create table if not exists campanha_metas_pessoais (
  id bigserial primary key,
  campanha_id bigint not null references campanhas(id) on delete cascade,
  publicador_id uuid not null references profiles(id) on delete cascade,
  texto text not null,
  feito boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists campanha_metas_pessoais_campanha_pub_idx
  on campanha_metas_pessoais(campanha_id, publicador_id);

alter table campanha_metas_pessoais enable row level security;

drop policy if exists campanha_metas_pessoais_select on campanha_metas_pessoais;
create policy campanha_metas_pessoais_select on campanha_metas_pessoais for select
  using (publicador_id = auth.uid() or is_admin());
drop policy if exists campanha_metas_pessoais_write on campanha_metas_pessoais;
create policy campanha_metas_pessoais_write on campanha_metas_pessoais for all
  using (publicador_id = auth.uid() or is_admin())
  with check (publicador_id = auth.uid() or is_admin());
