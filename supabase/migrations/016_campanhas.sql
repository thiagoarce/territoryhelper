-- Tabela campanhas (plural): agrupa objetivos por período.
-- Atualiza schema do GAS: lá era 1 setting ativa global; aqui é histórico.

create table if not exists campanhas (
  id bigserial primary key,
  nome text not null,
  data_inicio date not null,
  data_alvo date not null,
  meta_semanal integer,
  ativa boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Só uma ativa por vez (Postgres partial unique index)
create unique index if not exists campanhas_uma_ativa on campanhas(ativa) where ativa = true;

-- Objetivos passam a poder referenciar uma campanha (NULL = legado, sem período)
alter table campanha add column if not exists campanha_id bigint references campanhas(id) on delete set null;

create index if not exists campanha_campanha_id_idx on campanha(campanha_id);

-- RLS
alter table campanhas enable row level security;

create policy campanhas_select_all on campanhas for select using (true);
create policy campanhas_insert_admin on campanhas for insert with check (is_admin());
create policy campanhas_update_admin on campanhas for update using (is_admin());
create policy campanhas_delete_admin on campanhas for delete using (is_admin());

-- Trigger atualizado_em (cria a função se ainda não existir)
create or replace function tg_set_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists campanhas_atualizado_em on campanhas;
create trigger campanhas_atualizado_em
  before update on campanhas
  for each row
  execute function tg_set_atualizado_em();
