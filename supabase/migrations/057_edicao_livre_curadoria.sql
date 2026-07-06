-- 057 (T11/A5+A6+A7+A8): edição de OVERLAY liberada pra qualquer
-- publicador autenticado + fila de CURADORIA do admin + flag "não
-- existe mais" + ordem manual dos locais na quadra.
--
-- Modelo de segurança novo em locais/unidades:
--   - UPDATE: liberado pra authenticated, MAS um trigger de guarda
--     impede não-admin de tocar colunas ESTRUTURAIS (geo, quadra_id,
--     logradouro, numero, códigos IBGE, pendente...) e exige posse
--     (pode_editar_local) pra colunas de CARTA (trabalho, não overlay).
--   - INSERT/DELETE: como eram (posse), com um adendo: criador de
--     local pendente pode inserir as unidades dele.
--   - Toda edição de overlay feita por não-admin gera linha em
--     curadoria_edicoes (app) — admin confirma ou reverte.
-- Idempotente: pode rodar mais de uma vez.

-- ── 1. Colunas novas ────────────────────────────────────────────────
alter table locais add column if not exists marcado_nao_existe boolean not null default false;
alter table locais add column if not exists marcado_por uuid references profiles(id) on delete set null;
alter table locais add column if not exists marcado_em timestamptz;
alter table locais add column if not exists ordem_na_quadra int;

comment on column locais.marcado_nao_existe is
  'Feedback do publicador: endereço não existe mais. Esmaece na UI e sai das contagens; admin confirma (exclui/inativa) ou reverte via curadoria.';
comment on column locais.ordem_na_quadra is
  'Ordem manual do local na lista da quadra (ajuste fino do publicador). Null = heurística padrão.';

-- ── 2. Fila de curadoria ────────────────────────────────────────────
create table if not exists curadoria_edicoes (
  id bigserial primary key,
  local_id bigint references locais(id) on delete cascade,
  unidade_id bigint references unidades(id) on delete cascade,
  publicador_id uuid references profiles(id) on delete set null,
  tipo text not null check (tipo in ('edicao','criacao','nao_existe')),
  antes jsonb,
  depois jsonb,
  status text not null default 'pendente' check (status in ('pendente','confirmado','revertido')),
  criado_em timestamptz not null default now(),
  resolvido_por uuid references profiles(id) on delete set null,
  resolvido_em timestamptz
);

create index if not exists curadoria_edicoes_status_idx on curadoria_edicoes (status, criado_em desc);

alter table curadoria_edicoes enable row level security;

drop policy if exists "curadoria_insert" on curadoria_edicoes;
create policy "curadoria_insert" on curadoria_edicoes
  for insert with check (publicador_id = auth.uid());

drop policy if exists "curadoria_select" on curadoria_edicoes;
create policy "curadoria_select" on curadoria_edicoes
  for select using (is_admin() or publicador_id = auth.uid());

drop policy if exists "curadoria_update" on curadoria_edicoes;
create policy "curadoria_update" on curadoria_edicoes
  for update using (is_admin()) with check (is_admin());

-- ── 3. UPDATE liberado + triggers de guarda ─────────────────────────

-- locais: não-admin não toca em coluna estrutural
create or replace function guard_locais_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if is_admin() then return new; end if;
  if (new.geo is distinct from old.geo)
    or (new.quadra_id is distinct from old.quadra_id)
    or (new.logradouro is distinct from old.logradouro)
    or (new.numero is distinct from old.numero)
    or (new.setor is distinct from old.setor)
    or (new.quadra_ibge is distinct from old.quadra_ibge)
    or (new.face_ibge is distinct from old.face_ibge)
    or (new.pendente is distinct from old.pendente)
    or (new.nao_eh_predio is distinct from old.nao_eh_predio)
    or (new.criado_por is distinct from old.criado_por)
  then
    raise exception 'Coluna estrutural do endereço — só admin altera';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_locais_update on locais;
create trigger trg_guard_locais_update
  before update on locais
  for each row execute function guard_locais_update();

-- unidades: não-admin não toca em estrutura; colunas de CARTA exigem
-- posse (trabalho de cartas continua restrito a quem tem o prédio)
create or replace function guard_unidades_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if is_admin() then return new; end if;
  if (new.local_id is distinct from old.local_id)
    or (new.legacy_row is distinct from old.legacy_row)
  then
    raise exception 'Coluna estrutural da unidade — só admin altera';
  end if;
  if (new.carta_entregue is distinct from old.carta_entregue)
    or (new.carta_escrita is distinct from old.carta_escrita)
    or (new.carta_escrita_por is distinct from old.carta_escrita_por)
  then
    if not pode_editar_local(new.local_id) then
      raise exception 'Marcar carta exige posse do prédio';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_unidades_update on unidades;
create trigger trg_guard_unidades_update
  before update on unidades
  for each row execute function guard_unidades_update();

-- policies de UPDATE: de posse → qualquer autenticado (o trigger guarda)
drop policy if exists locais_update_scope on locais;
drop policy if exists locais_update_livre on locais;
create policy locais_update_livre on locais
  for update to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists unidades_update_scope on unidades;
drop policy if exists unidades_update_livre on unidades;
create policy unidades_update_livre on unidades
  for update to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── 4. INSERT de unidades: criador de local pendente pode criar as dele
drop policy if exists unidades_insert_scope on unidades;
create policy unidades_insert_scope on unidades
  for insert with check (
    pode_editar_local(local_id)
    or exists (
      select 1 from locais l
      where l.id = local_id and l.pendente = true and l.criado_por = auth.uid()
    )
  );
