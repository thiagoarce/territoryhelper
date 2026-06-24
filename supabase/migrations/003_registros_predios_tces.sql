-- ============================================================================
-- 003_registros_predios_tces.sql
-- Tabelas que completam o domínio: trilha de visitas, overlay de prédios
-- e Territórios Comerciais Especiais.
-- ============================================================================

-- Registros: trilha de eventos por endereço. Tipo é o que aconteceu.
-- No app antigo, ID = row de Dados Brutos. Aqui FK em enderecos via endereco_id.
create table registros (
  id bigserial primary key,
  endereco_id bigint not null references enderecos(id) on delete cascade,
  tipo text not null,  -- conversou | semConversa | naoAtendeu | carta | carta_undo | interfone | manual | auto | desfeito
  ts timestamptz not null default now(),
  publicador_id uuid references profiles(id) on delete set null,
  data date  -- redundante com ts mas útil pra agrupar por dia rápido
);

create index registros_endereco_idx on registros(endereco_id);
create index registros_ts_idx on registros(ts desc);

-- Predios: overlay manual sobre grupos de endereços (mesmo logradouro+numero).
-- chave = logradouro|numero (mesmo formato do app antigo, lowercase).
create table predios (
  chave text primary key,
  nome text,
  irmao_mora boolean not null default false,
  nome_irmao text,
  ultima_carta date,
  notas text,
  acesso_interfone text,  -- legado: 'individual' | 'portaria' | ''
  nao_eh_predio boolean not null default false,
  tipo_entrada text,  -- 'porteiro' | 'eletronica' | 'sem' | ''
  acesso_caixas boolean not null default false,
  acesso_interfones boolean not null default false,
  atualizado_em timestamptz not null default now()
);

-- PrediosAptos: overlay per-apto (carta escrita/entregue, desocupado, não escrever).
create table predios_aptos (
  endereco_id bigint primary key references enderecos(id) on delete cascade,
  carta_escrita date,
  carta_entregue date,
  desocupado boolean not null default false,
  nao_escrever boolean not null default false,
  atualizado_em timestamptz not null default now()
);

-- TCEs: Territórios Comerciais Especiais — agrupam endereços comerciais
-- de quadras diferentes em um território próprio.
create table tces (
  id text primary key,
  nome text not null,
  tipo text not null default 'comercial',
  endereco_ids bigint[] not null default '{}',
  poly_string text,
  publicador_id uuid references profiles(id) on delete set null,
  prazo date,
  status text not null default 'aberto',  -- aberto | concluido | cancelado
  criado_em timestamptz not null default now(),
  data_conclusao date,
  notas text
);

create index tces_status_idx on tces(status);
create index tces_publicador_idx on tces(publicador_id);

-- Campanha: objetivos estruturados (geral/semana) por modalidade.
create table campanha (
  id bigserial primary key,
  tipo text not null,  -- geral | semana
  modalidade text not null,  -- casa | comercial | rural | cartas | telefone | publico
  titulo text not null,
  descricao text,
  link text,
  anexo_nome text,
  anexo_url text,
  publico boolean not null default false,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

-- ============================================================================
-- RLS
-- ============================================================================
alter table registros enable row level security;
alter table predios enable row level security;
alter table predios_aptos enable row level security;
alter table tces enable row level security;
alter table campanha enable row level security;

-- Registros: leitura por todos autenticados; write por todos autenticados
-- (publicador grava desfecho/carta). Refinaremos quando portar features.
create policy "registros_read" on registros for select to authenticated using (true);
create policy "registros_insert_authenticated" on registros for insert to authenticated
  with check (true);
create policy "registros_admin_update_delete" on registros for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "registros_admin_delete" on registros for delete to authenticated
  using (is_admin());

create policy "predios_read" on predios for select to authenticated using (true);
create policy "predios_write_authenticated" on predios for all to authenticated
  using (true) with check (true);  -- publicador edita overlay; refinaremos depois

create policy "predios_aptos_read" on predios_aptos for select to authenticated using (true);
create policy "predios_aptos_write" on predios_aptos for all to authenticated
  using (true) with check (true);

create policy "tces_read" on tces for select to authenticated using (true);
create policy "tces_admin_write" on tces for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "campanha_read" on campanha for select to authenticated using (true);
create policy "campanha_admin_write" on campanha for all to authenticated
  using (is_admin()) with check (is_admin());
