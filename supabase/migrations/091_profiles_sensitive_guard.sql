-- ============================================================================
-- 091_profiles_sensitive_guard.sql
--
-- Corrige duas falhas na guarda de campos privilegiados de `profiles`:
--
-- 1. A versão anterior usava `current_user` dentro de uma função
--    SECURITY DEFINER. Nesse contexto, `current_user` é o proprietário da
--    função (normalmente postgres), não necessariamente o chamador original;
--    por isso o bypass administrativo podia ser aplicado a qualquer usuário.
--
-- 2. `tp_aprovado` foi acrescentado pela migration 068 depois da última
--    definição da guarda e podia ser alterado pelo próprio publicador através
--    da policy de atualização do próprio perfil.
--
-- O contexto confiável de backend/SQL é identificado por `auth.uid() is null`.
-- Requisições normais autenticadas têm UID e só podem alterar os campos
-- privilegiados quando `is_admin()` for verdadeiro.
-- ============================================================================

create or replace function profiles_guard_sensitive() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- SQL direto e service_role não carregam UID de usuário final. Esses
  -- contextos já são privilegiados e precisam continuar aptos a administrar
  -- perfis e executar restaurações/migrações.
  if auth.uid() is null then
    return new;
  end if;

  if (
    new.role is distinct from old.role
    or new.ativo is distinct from old.ativo
    or new.servo_publicacoes is distinct from old.servo_publicacoes
    or new.tp_aprovado is distinct from old.tp_aprovado
  ) and not is_admin() then
    raise exception
      'Apenas admin pode alterar role, status ativo, servo de publicações ou aprovação de testemunho público';
  end if;

  return new;
end;
$$;
