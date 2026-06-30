-- Arranjos: eventos semanais coordenados pelo admin (cartas, pregação, TP...).
-- Admin configura modalidades primeiro, depois cria arranjos.
-- Dirigente vê e distribui aos publicadores (no painel dirigente, separado).

-- 1) Modalidades configuráveis pelo admin.
--    tipo_territorio define o que o arranjo "usa":
--      quadras       — designa um conjunto de quadras
--      cartas_lista  — lista de prédios/locais pra cartas
--      arquivo       — admin sobe um arquivo (PDF/imagem)
--      ponto_tp      — ponto fixo de testemunho público (sem território)
create table if not exists arranjo_modalidades (
  id bigserial primary key,
  nome text not null,
  tipo_territorio text not null
    check (tipo_territorio in ('quadras','cartas_lista','arquivo','ponto_tp')),
  default_local text,
  default_dia_semana int check (default_dia_semana between 0 and 6),
  default_hora time,
  cor text default '#3b82f6',
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

-- 2) Arranjos = eventos (templates recorrentes ou pontuais).
--    Cria base mínima (só id), depois ALTER ... ADD COLUMN IF NOT EXISTS pra
--    cada coluna. Idempotente mesmo se a tabela ficou parcial antes.
create table if not exists arranjos (
  id bigserial primary key
);

alter table arranjos add column if not exists modalidade_id bigint;
-- FK via constraint nomeada (ALTER ADD COLUMN não suporta REFERENCES idempotente)
do $$ begin
  alter table arranjos add constraint arranjos_modalidade_fk
    foreign key (modalidade_id) references arranjo_modalidades(id) on delete restrict;
exception when duplicate_object then null;
end $$;
-- NOT NULL só se a tabela ainda estiver vazia (segurança em re-runs)
do $$ begin
  if not exists (select 1 from arranjos limit 1) then
    alter table arranjos alter column modalidade_id set not null;
  end if;
end $$;

alter table arranjos add column if not exists nome text;
-- Garante que nome é nullable (versão antiga da migration deixou NOT NULL)
do $$ begin
  alter table arranjos alter column nome drop not null;
exception when others then null;
end $$;
alter table arranjos add column if not exists recorrente boolean not null default false;
alter table arranjos add column if not exists dia_semana int;
do $$ begin
  alter table arranjos add constraint arranjos_dia_semana_check
    check (dia_semana between 0 and 6) not valid;
exception when duplicate_object then null;
end $$;
alter table arranjos add column if not exists data date;
alter table arranjos add column if not exists hora_inicio time;
alter table arranjos add column if not exists hora_fim time;
alter table arranjos add column if not exists local_endereco text;
alter table arranjos add column if not exists local_lat double precision;
alter table arranjos add column if not exists local_lng double precision;
alter table arranjos add column if not exists dirigente_id uuid references profiles(id) on delete set null;
alter table arranjos add column if not exists quadras_ids text[];
alter table arranjos add column if not exists cartas_locais_ids bigint[];
alter table arranjos add column if not exists arquivo_url text;
alter table arranjos add column if not exists arquivo_nome text;
alter table arranjos add column if not exists notas text;
alter table arranjos add column if not exists ativo boolean not null default true;
alter table arranjos add column if not exists data_inicio date;
alter table arranjos add column if not exists data_fim date;
alter table arranjos add column if not exists criado_em timestamptz not null default now();
alter table arranjos add column if not exists criado_por uuid references profiles(id) on delete set null;
alter table arranjos add column if not exists atualizado_em timestamptz not null default now();

create index if not exists arranjos_dia_idx on arranjos(dia_semana) where recorrente;
create index if not exists arranjos_data_idx on arranjos(data) where not recorrente;
create index if not exists arranjos_modalidade_idx on arranjos(modalidade_id);

-- 3) RLS — leitura pra qualquer autenticado, escrita só admin.
alter table arranjo_modalidades enable row level security;
alter table arranjos enable row level security;

drop policy if exists arranjo_modalidades_select on arranjo_modalidades;
create policy arranjo_modalidades_select on arranjo_modalidades
  for select using (auth.uid() is not null);

drop policy if exists arranjo_modalidades_admin_write on arranjo_modalidades;
create policy arranjo_modalidades_admin_write on arranjo_modalidades
  for all using (is_admin()) with check (is_admin());

drop policy if exists arranjos_select on arranjos;
create policy arranjos_select on arranjos
  for select using (auth.uid() is not null);

drop policy if exists arranjos_admin_write on arranjos;
create policy arranjos_admin_write on arranjos
  for all using (is_admin()) with check (is_admin());

-- 4) Trigger pra atualizar atualizado_em
create or replace function _arranjos_touch()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

drop trigger if exists arranjos_touch on arranjos;
create trigger arranjos_touch before update on arranjos
  for each row execute function _arranjos_touch();

-- 5) Storage bucket pra arquivos de arranjo (PDFs, imagens, etc).
insert into storage.buckets (id, name, public)
values ('arranjos', 'arranjos', true)
on conflict (id) do nothing;

drop policy if exists arranjos_storage_read on storage.objects;
create policy arranjos_storage_read on storage.objects
  for select using (bucket_id = 'arranjos');

drop policy if exists arranjos_storage_admin_write on storage.objects;
create policy arranjos_storage_admin_write on storage.objects
  for all using (bucket_id = 'arranjos' and is_admin())
  with check (bucket_id = 'arranjos' and is_admin());
