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
create table if not exists arranjos (
  id bigserial primary key,
  modalidade_id bigint not null references arranjo_modalidades(id) on delete restrict,
  nome text,                                   -- opcional; senão usa nome da modalidade
  recorrente boolean not null default false,   -- true = repete toda semana no dia_semana
  dia_semana int check (dia_semana between 0 and 6),
  data date,                                   -- usado quando NÃO recorrente
  hora_inicio time,
  hora_fim time,
  local_endereco text,
  local_lat double precision,
  local_lng double precision,
  dirigente_id uuid references profiles(id) on delete set null,
  quadras_ids text[],                          -- pra tipo 'quadras'
  cartas_locais_ids bigint[],                  -- pra tipo 'cartas_lista'
  arquivo_url text,                            -- pra tipo 'arquivo'
  arquivo_nome text,
  notas text,
  ativo boolean not null default true,
  data_inicio date,                            -- recorrente: começa em
  data_fim date,                               -- recorrente: termina em (null = indef)
  criado_em timestamptz not null default now(),
  criado_por uuid references profiles(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

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
