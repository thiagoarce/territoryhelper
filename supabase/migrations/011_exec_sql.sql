-- ============================================================================
-- 011_exec_sql.sql
-- Função pra executar SQL arbitrário via RPC. Usada pelo endpoint
-- /admin/dev/sql do app pra rodar arquivos SQL grandes (migração de
-- dados) sem precisar colar no SQL Editor.
--
-- SECURITY: SECURITY DEFINER + restrição explícita a role 'admin'.
-- Quem chama via API precisa ser admin OU usar service_role (que
-- bypassa RLS no client mas a função aqui valida explicitamente).
-- ============================================================================

create or replace function exec_sql(query text) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  -- Permite service_role (admin API key) ou admin logado
  if current_user not in ('postgres', 'service_role') and not is_admin() then
    raise exception 'Acesso negado: exec_sql requer admin ou service_role';
  end if;
  execute query;
end;
$$;

-- Revoga o EXECUTE pra qualquer um — só service_role chama via REST.
revoke execute on function exec_sql(text) from anon, authenticated;
grant execute on function exec_sql(text) to service_role;
