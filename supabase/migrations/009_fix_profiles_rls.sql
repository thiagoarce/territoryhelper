-- ============================================================================
-- 009_fix_profiles_rls.sql
-- FIX: Migration 001 criou policy "profiles_admin_all" e
-- "profiles_update_self_nome" com subqueries inline em profiles
-- (`(select role from profiles where id = auth.uid())`).
-- Isso causa RECURSÃO INFINITA: a policy é avaliada → roda a subquery →
-- subquery na mesma tabela → RLS avalia a policy de novo → loop.
-- Postgres aborta com "infinite recursion detected in policy for relation".
--
-- Fix: usa a função `is_admin()` que é SECURITY DEFINER e roda como
-- postgres (que tem BYPASSRLS). A subquery interna não dispara RLS.
-- ============================================================================

-- Drop as policies bugadas
drop policy if exists "profiles_admin_all" on profiles;
drop policy if exists "profiles_update_self_nome" on profiles;

-- Admin (via security-definer function) pode tudo
create policy "profiles_admin_all" on profiles
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- Usuário pode editar SEU próprio nome (role/ativo só admin altera).
-- Trigger separada garante imutabilidade desses campos via app — RLS aqui
-- só checa que é o próprio user editando.
create policy "profiles_update_self" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Bloqueia mudança de role/ativo por non-admin via trigger
create function profiles_guard_sensitive() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.ativo is distinct from old.ativo)
     and not public.is_admin() then
    raise exception 'Apenas admin pode alterar role ou status ativo';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_sensitive on profiles;
create trigger profiles_guard_sensitive
  before update on profiles
  for each row execute function profiles_guard_sensitive();
