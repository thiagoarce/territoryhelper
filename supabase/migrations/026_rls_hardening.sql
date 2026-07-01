-- ============================================================================
-- 026_rls_hardening.sql — Endurecimento RLS (Fase 1 do specs.md).
-- Publicador só faz UPDATE em locais/unidades cujo prédio (via quadra ou
-- cartas_locais_ids do arranjo) está numa designação/arranjo ATIVO dele.
-- Admin/dirigente continuam com acesso total. RLS de leitura permanece aberta.
--
-- Idempotente: drop policies antigas antes de criar as novas.
-- Aplicar via /admin/dev/sql colando o conteúdo desse arquivo.
-- ============================================================================

-- Helper: escopo de edição pra um publicador — retorna true se o local
-- (id) pertence a uma designação ativa OU a um arranjo cartas_lista ativo
-- OU se ele é dirigente do arranjo que engloba a quadra do local.
create or replace function pode_editar_local(p_local_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    is_admin()
    or exists (
      -- é dirigente ou admin (pra dirigente/admin escrever sem depender de designação)
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('admin','dirigente')
    )
    or exists (
      -- publicador com designação ativa cobrindo a quadra do local
      select 1
      from locais l
      join designacao_quadras dq on dq.quadra_id = l.quadra_id
      join designacoes d on d.id = dq.designacao_id
      where l.id = p_local_id
        and d.publicador_id = auth.uid()
        and d.status = 'aberta'
    )
    or exists (
      -- publicador com arranjo cartas_lista ativo que inclui esse local
      select 1
      from arranjos a
      where a.ativo = true
        and a.cartas_locais_ids @> array[p_local_id]
        and (a.dirigente_id = auth.uid() or a.dirigente_id is null)
    );
$$;

grant execute on function pode_editar_local(bigint) to authenticated;

-- ----------------------------------------------------------------------------
-- LOCAIS: substitui update_authenticated permissivo por update_scope estrito.
-- ----------------------------------------------------------------------------
drop policy if exists "locais_update_authenticated" on locais;
drop policy if exists "locais_update_scope" on locais;

create policy "locais_update_scope" on locais
  for update to authenticated
  using (pode_editar_local(id))
  with check (pode_editar_local(id));

-- ----------------------------------------------------------------------------
-- UNIDADES: idem, escopo derivado do local_id da unidade.
-- ----------------------------------------------------------------------------
drop policy if exists "unidades_update_authenticated" on unidades;
drop policy if exists "unidades_update_scope" on unidades;

create policy "unidades_update_scope" on unidades
  for update to authenticated
  using (pode_editar_local(local_id))
  with check (pode_editar_local(local_id));

-- ----------------------------------------------------------------------------
-- LOCAIS INSERT/DELETE por publicador: permitido só se a quadra que ele vai
-- vincular está numa designação ativa dele. Admin/dirigente sempre podem.
-- ----------------------------------------------------------------------------
drop policy if exists "locais_insert_admin" on locais;
drop policy if exists "locais_insert_scope" on locais;

create policy "locais_insert_scope" on locais
  for insert to authenticated
  with check (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
    or (
      quadra_id is not null
      and exists (
        select 1 from designacao_quadras dq
        join designacoes d on d.id = dq.designacao_id
        where dq.quadra_id = locais.quadra_id
          and d.publicador_id = auth.uid()
          and d.status = 'aberta'
      )
    )
  );

drop policy if exists "locais_delete_admin" on locais;
drop policy if exists "locais_delete_scope" on locais;
create policy "locais_delete_scope" on locais
  for delete to authenticated
  using (pode_editar_local(id));

-- ----------------------------------------------------------------------------
-- UNIDADES INSERT/DELETE: mesma lógica pelo local_id.
-- ----------------------------------------------------------------------------
drop policy if exists "unidades_insert_admin" on unidades;
drop policy if exists "unidades_insert_scope" on unidades;
create policy "unidades_insert_scope" on unidades
  for insert to authenticated
  with check (pode_editar_local(local_id));

drop policy if exists "unidades_delete_admin" on unidades;
drop policy if exists "unidades_delete_scope" on unidades;
create policy "unidades_delete_scope" on unidades
  for delete to authenticated
  using (pode_editar_local(local_id));
