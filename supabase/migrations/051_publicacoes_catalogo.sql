-- ============================================================================
-- 051_publicacoes_catalogo.sql — catálogo real de publicações (S-14-T):
-- categoria (mesma taxonomia do formulário oficial), estoque manual
-- (snapshot que o servo atualiza batendo com o relatório do JW Hub — NÃO
-- é movimento/entrada-saída, só um número exibido pro publicador antes de
-- pedir) e imagem de capa. Também a "necessidade regular" de revistas
-- (Despertai/Sentinela vêm normalmente; isso é só uma preferência
-- informativa, não um pedido com status).
-- ============================================================================

alter table publicacoes add column if not exists categoria text not null default 'outro'
  check (categoria in ('biblia', 'livro', 'brochura', 'folheto', 'cartao_visita', 'revista', 'formulario', 'outro'));
alter table publicacoes add column if not exists qtd_estoque int not null default 0;
alter table publicacoes add column if not exists imagem_url text;

-- Permite ON CONFLICT (codigo) no seed (052) sem duplicar se rodado 2x,
-- e evita cadastro duplicado do mesmo item pelo servo.
create unique index if not exists publicacoes_codigo_unq on publicacoes(codigo) where codigo is not null;

-- Bucket de imagens de capa — mesmo padrão de fotos-locais (015).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-publicacoes', 'fotos-publicacoes', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "fotos_publicacoes_read" on storage.objects;
create policy "fotos_publicacoes_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'fotos-publicacoes');
drop policy if exists "fotos_publicacoes_insert" on storage.objects;
create policy "fotos_publicacoes_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-publicacoes');
drop policy if exists "fotos_publicacoes_delete" on storage.objects;
create policy "fotos_publicacoes_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-publicacoes');

-- Necessidade regular (só revistas, na prática) — "normalmente preciso de
-- N por edição". Sem status/fluxo de aprovação, é só uma preferência que
-- o servo consulta; publicador só mexe na própria linha.
create table if not exists publicador_necessidade_regular (
  id bigserial primary key,
  publicador_id uuid not null references profiles(id) on delete cascade,
  publicacao_id bigint not null references publicacoes(id) on delete cascade,
  qtd int not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (publicador_id, publicacao_id)
);

alter table publicador_necessidade_regular enable row level security;

drop policy if exists publicador_necessidade_regular_select on publicador_necessidade_regular;
create policy publicador_necessidade_regular_select on publicador_necessidade_regular for select
  using (publicador_id = auth.uid() or is_servo_pub());
drop policy if exists publicador_necessidade_regular_write on publicador_necessidade_regular;
create policy publicador_necessidade_regular_write on publicador_necessidade_regular for all
  using (publicador_id = auth.uid())
  with check (publicador_id = auth.uid());
