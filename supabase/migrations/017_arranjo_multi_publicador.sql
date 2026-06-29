-- Multi-publicador por designação + conceito de "arranjo" (saída em grupo dirigida)
-- Razão: pessoas trabalham juntas em quadras; dirigentes coordenam saídas
-- onde múltiplos publicadores cobrem um conjunto de quadras juntos.

-- 1) Join table N:N entre designacao e publicador (mantém publicador_id como dono/criador)
create table if not exists designacao_publicadores (
  designacao_id bigint not null references designacoes(id) on delete cascade,
  publicador_id uuid not null references profiles(id) on delete cascade,
  papel text not null default 'participante',     -- 'lider' | 'participante'
  adicionado_em timestamptz not null default now(),
  primary key (designacao_id, publicador_id)
);

create index if not exists designacao_publicadores_pub_idx on designacao_publicadores(publicador_id);

-- Backfill: cada designacao existente passa a ter o publicador_id como participante "lider"
insert into designacao_publicadores (designacao_id, publicador_id, papel)
select id, publicador_id, 'lider' from designacoes
where publicador_id is not null
on conflict (designacao_id, publicador_id) do nothing;

-- 2) Tipo de designação: pessoal (publicador trabalha sozinho/em dupla) vs arranjo (saída em grupo)
alter table designacoes add column if not exists tipo text not null default 'pessoal';
alter table designacoes add constraint designacoes_tipo_check
  check (tipo in ('pessoal', 'arranjo')) not valid;

-- 3) Detalhes de arranjo (quando designacoes.tipo = 'arranjo')
--    Dia/hora/ponto de encontro. Dirigentes coordenam isso.
alter table designacoes add column if not exists data_encontro date;
alter table designacoes add column if not exists hora_encontro time;
alter table designacoes add column if not exists ponto_encontro_endereco text;
alter table designacoes add column if not exists ponto_encontro_lat double precision;
alter table designacoes add column if not exists ponto_encontro_lng double precision;
alter table designacoes add column if not exists dirigente_id uuid references profiles(id) on delete set null;

create index if not exists designacoes_tipo_idx on designacoes(tipo);
create index if not exists designacoes_data_encontro_idx on designacoes(data_encontro) where tipo = 'arranjo';

-- 4) RLS: dirigentes (e admins) podem ver arranjos uns dos outros
--    Publicadores só veem arranjos onde estão listados em designacao_publicadores
--    O policy update aplica via OR — adapta sem dropar tudo.

-- Helper: usuário é dirigente ou admin?
create or replace function is_dirigente_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('dirigente','admin')
  );
$$;

-- Permite que dirigentes vejam todos os arranjos (não só os seus)
drop policy if exists designacoes_select_dirigentes on designacoes;
create policy designacoes_select_dirigentes on designacoes
  for select using (
    tipo = 'arranjo' and is_dirigente_or_admin()
  );

-- RLS da nova tabela
alter table designacao_publicadores enable row level security;

create policy desig_pub_select_member on designacao_publicadores
  for select using (
    publicador_id = auth.uid()
    or exists (
      select 1 from designacoes d
      where d.id = designacao_id
      and (d.tipo = 'arranjo' and is_dirigente_or_admin())
    )
    or is_admin()
  );

create policy desig_pub_insert_admin on designacao_publicadores
  for insert with check (is_dirigente_or_admin());

create policy desig_pub_delete_admin on designacao_publicadores
  for delete using (is_dirigente_or_admin());
