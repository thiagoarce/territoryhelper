-- ============================================================================
-- 027_delegacoes_temp.sql — Delegação temporária (specs.md revisado).
--
-- Dirigente delega subconjunto das quadras dele a outro publicador durante
-- uma saída de campo. NÃO vira designação persistente — expira sozinha no
-- fim do dia (ou prazo). Publicador vê durante a expiração no home.
--
-- Modelagem:
--   - Tabela leve com quadras_ids text[] (não junção — vida curta, sem FK)
--   - data_fim: default = hoje 23:59 local (dirigente ajusta se quiser)
--   - Consulta ativa: data_fim > now()
--
-- Idempotente.
-- ============================================================================

create table if not exists delegacoes_temp (
  id bigserial primary key,
  dirigente_id uuid not null references profiles(id) on delete cascade,
  publicador_id uuid not null references profiles(id) on delete cascade,
  quadras_ids text[] not null default '{}',
  data_fim timestamptz not null default (date_trunc('day', now()) + interval '23 hours 59 minutes'),
  notas text,
  criada_em timestamptz not null default now()
);

create index if not exists delegacoes_temp_publicador_ativas
  on delegacoes_temp(publicador_id, data_fim)
  where data_fim > now();

create index if not exists delegacoes_temp_dirigente_ativas
  on delegacoes_temp(dirigente_id, data_fim)
  where data_fim > now();

alter table delegacoes_temp enable row level security;

-- Publicador vê as suas ativas
drop policy if exists delegacoes_temp_publicador_read on delegacoes_temp;
create policy delegacoes_temp_publicador_read on delegacoes_temp
  for select to authenticated
  using (publicador_id = auth.uid());

-- Dirigente vê as que ele criou
drop policy if exists delegacoes_temp_dirigente_read on delegacoes_temp;
create policy delegacoes_temp_dirigente_read on delegacoes_temp
  for select to authenticated
  using (dirigente_id = auth.uid());

-- Admin vê tudo
drop policy if exists delegacoes_temp_admin_read on delegacoes_temp;
create policy delegacoes_temp_admin_read on delegacoes_temp
  for select to authenticated
  using (is_admin());

-- Dirigente/admin escreve
drop policy if exists delegacoes_temp_dirigente_write on delegacoes_temp;
create policy delegacoes_temp_dirigente_write on delegacoes_temp
  for all to authenticated
  using (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
  )
  with check (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
  );

-- Estende pode_editar_local (migration 026) pra incluir delegações temp
-- do publicador — assim ele consegue editar unidades das quadras que
-- foram delegadas temporariamente pra ele.
create or replace function pode_editar_local(p_local_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    is_admin()
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('admin','dirigente')
    )
    or exists (
      select 1
      from locais l
      join designacao_quadras dq on dq.quadra_id = l.quadra_id
      join designacoes d on d.id = dq.designacao_id
      where l.id = p_local_id
        and d.publicador_id = auth.uid()
        and d.status = 'aberta'
    )
    or exists (
      -- Delegação temporária ativa incluindo a quadra do local
      select 1
      from locais l
      join delegacoes_temp t on t.publicador_id = auth.uid()
      where l.id = p_local_id
        and l.quadra_id = any(t.quadras_ids)
        and t.data_fim > now()
    )
    or exists (
      select 1
      from arranjos a
      where a.ativo = true
        and a.cartas_locais_ids @> array[p_local_id]
        and (a.dirigente_id = auth.uid() or a.dirigente_id is null)
    );
$$;
