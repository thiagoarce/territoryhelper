-- ============================================================================
-- 010_fix_search_path_e_service_role.sql
-- FIX 1: auth_role() e is_admin() não tinham `set search_path` explícito.
-- Quando chamadas por outras funções com `set search_path = ''` (ex: a
-- trigger profiles_guard_sensitive da 009), o auth_role não era resolvido →
-- "function auth_role() does not exist".
--
-- FIX 2: profiles_guard_sensitive bloqueava TODA mudança de role/ativo se
-- não fosse "admin" — mas chamadas via service_role (admin API do backend)
-- não têm contexto de usuário (auth.uid() é null), então is_admin() retorna
-- false. Resultado: admin via API nunca consegue criar/promover usuários.
-- Solução: bypass pra service_role e postgres (ops administrativas).
-- ============================================================================

-- Recria auth_role com search_path explícito
create or replace function auth_role() returns role_usuario
  language sql security definer stable
  set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- Recria is_admin com search_path explícito
create or replace function is_admin() returns boolean
  language sql security definer stable
  set search_path = public
as $$
  select auth_role() = 'admin';
$$;

-- Recria a trigger com bypass pra service_role/postgres
create or replace function profiles_guard_sensitive() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  -- Operações administrativas (service_role key no backend, ou postgres
  -- direto no SQL Editor) bypassam — quem chama via essas roles é admin
  -- por definição.
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if (new.role is distinct from old.role or new.ativo is distinct from old.ativo)
     and not is_admin() then
    raise exception 'Apenas admin pode alterar role ou status ativo';
  end if;
  return new;
end;
$$;
