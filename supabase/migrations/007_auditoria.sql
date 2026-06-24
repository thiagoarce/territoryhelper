-- ============================================================================
-- 007_auditoria.sql — Domínio 6: quem mudou o quê (transversal)
-- audit_log + trigger genérica aplicada nas tabelas-chave.
-- Trigger captura INSERT/UPDATE/DELETE e grava antes/depois + autor.
-- ============================================================================

create table audit_log (
  id bigserial primary key,
  tabela text not null,
  registro_id text not null,                 -- id como text (cobre bigint, uuid, text)
  acao text not null,                        -- INSERT | UPDATE | DELETE
  antes jsonb,                               -- snapshot antes (UPDATE/DELETE)
  depois jsonb,                              -- snapshot depois (INSERT/UPDATE)
  autor_id uuid references profiles(id) on delete set null,
  ts timestamptz not null default now()
);

create index audit_log_tabela_ts on audit_log(tabela, ts desc);
create index audit_log_registro_idx on audit_log(tabela, registro_id);
create index audit_log_autor_idx on audit_log(autor_id, ts desc) where autor_id is not null;

-- ----------------------------------------------------------------------------
-- Função genérica de auditoria.
-- Lê auth.uid() pra registrar o autor (NULL se vier de service_role/cron).
-- Atualiza atualizado_em quando aplicável (coluna existe na tabela).
-- ----------------------------------------------------------------------------
create function audit_trigger() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_autor uuid := auth.uid();
  v_id text;
  v_antes jsonb := null;
  v_depois jsonb := null;
begin
  if (tg_op = 'INSERT') then
    v_depois := to_jsonb(new);
    v_id := coalesce((to_jsonb(new)->>'id'), '');
  elsif (tg_op = 'UPDATE') then
    v_antes := to_jsonb(old);
    v_depois := to_jsonb(new);
    v_id := coalesce((to_jsonb(new)->>'id'), '');
  elsif (tg_op = 'DELETE') then
    v_antes := to_jsonb(old);
    v_id := coalesce((to_jsonb(old)->>'id'), '');
  end if;

  insert into public.audit_log (tabela, registro_id, acao, antes, depois, autor_id)
  values (tg_table_name, v_id, tg_op, v_antes, v_depois, v_autor);

  if (tg_op = 'DELETE') then return old; else return new; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Trigger updated_at: mantém atualizado_em sempre em sync com mudanças.
-- ----------------------------------------------------------------------------
create function bump_atualizado_em() returns trigger
  language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Aplica triggers nas tabelas relevantes
-- ----------------------------------------------------------------------------
-- profiles foi criado em 001 sem atualizado_em — adiciona agora pra
-- a trigger bump_atualizado_em funcionar.
alter table profiles add column if not exists atualizado_em timestamptz not null default now();

-- Auditoria
create trigger audit_territorios after insert or update or delete on territorios
  for each row execute function audit_trigger();
create trigger audit_quadras after insert or update or delete on quadras
  for each row execute function audit_trigger();
create trigger audit_locais after insert or update or delete on locais
  for each row execute function audit_trigger();
create trigger audit_unidades after insert or update or delete on unidades
  for each row execute function audit_trigger();
create trigger audit_designacoes after insert or update or delete on designacoes
  for each row execute function audit_trigger();
create trigger audit_tces after insert or update or delete on tces
  for each row execute function audit_trigger();
create trigger audit_profiles after update or delete on profiles
  for each row execute function audit_trigger();

-- updated_at automático
create trigger bump_territorios before update on territorios
  for each row execute function bump_atualizado_em();
create trigger bump_quadras before update on quadras
  for each row execute function bump_atualizado_em();
create trigger bump_locais before update on locais
  for each row execute function bump_atualizado_em();
create trigger bump_unidades before update on unidades
  for each row execute function bump_atualizado_em();
create trigger bump_designacoes before update on designacoes
  for each row execute function bump_atualizado_em();
create trigger bump_tces before update on tces
  for each row execute function bump_atualizado_em();
create trigger bump_arranjos before update on arranjos
  for each row execute function bump_atualizado_em();
create trigger bump_campanha before update on campanha
  for each row execute function bump_atualizado_em();
create trigger bump_profiles before update on profiles
  for each row execute function bump_atualizado_em();
