-- A RLS desta baseline funciona como cinto de segurança. O trabalho operacional
-- permanece simples; privilégios, geometria e operações globais ficam protegidos.

alter table public.schema_versions enable row level security;
alter table public.installation_config enable row level security;
alter table public.import_runs enable row level security;
alter table public.profiles enable row level security;
alter table public.territorios enable row level security;
alter table public.territorio_limites enable row level security;
alter table public.quadras enable row level security;
alter table public.locais enable row level security;
alter table public.unidades enable row level security;
alter table public.convites enable row level security;
alter table public.designacoes enable row level security;
alter table public.designacao_quadras enable row level security;
alter table public.designacao_publicadores enable row level security;
alter table public.designacao_locais enable row level security;
alter table public.tces enable row level security;
alter table public.tce_unidades enable row level security;
alter table public.designacao_tces enable row level security;
alter table public.arranjo_modalidades enable row level security;
alter table public.arranjos enable row level security;
alter table public.arranjo_partes enable row level security;
alter table public.registros enable row level security;
alter table public.quadras_conclusoes enable row level security;
alter table public.curadoria_edicoes enable row level security;
alter table public.audit_log enable row level security;
alter table public.cartas_ciclos enable row level security;
alter table public.campanhas enable row level security;
alter table public.territorio_tokens enable row level security;
alter table public.cartas_tokens enable row level security;
alter table public.notificacoes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.erros_client enable row level security;
alter table public.job_execucoes enable row level security;
alter table public.lembretes_enviados enable row level security;

create policy "profiles_read_authenticated" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own_or_admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "metadata_read_admin" on public.schema_versions for select to authenticated using (public.is_admin());
create policy "metadata_manage_admin" on public.schema_versions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "config_read_authenticated" on public.installation_config for select to authenticated using (true);
create policy "config_manage_admin" on public.installation_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "imports_read_admin" on public.import_runs for select to authenticated using (public.is_admin());
create policy "imports_manage_admin" on public.import_runs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "territorios_read_authenticated" on public.territorios for select to authenticated using (true);
create policy "territorios_manage_admin" on public.territorios for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "limites_read_authenticated" on public.territorio_limites for select to authenticated using (true);
create policy "limites_manage_admin" on public.territorio_limites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "quadras_read_authenticated" on public.quadras for select to authenticated using (true);
create policy "quadras_insert_admin" on public.quadras for insert to authenticated with check (public.is_admin());
create policy "quadras_update_contextual" on public.quadras for update to authenticated
  using (public.is_admin() or public.pode_concluir_quadra(id, auth.uid()))
  with check (public.is_admin() or public.pode_concluir_quadra(id, auth.uid()));
create policy "quadras_delete_admin" on public.quadras for delete to authenticated using (public.is_admin());

-- Alterações operacionais entram imediatamente. Triggers guardam campos estruturais
-- e os snapshots de auditoria/curadoria permitem confirmar ou reverter depois.
create policy "locais_read_authenticated" on public.locais for select to authenticated using (true);
create policy "locais_insert_authenticated" on public.locais for insert to authenticated with check (auth.uid() is not null);
create policy "locais_update_authenticated" on public.locais for update to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "locais_delete_authenticated" on public.locais for delete to authenticated using (auth.uid() is not null);
create policy "unidades_read_authenticated" on public.unidades for select to authenticated using (true);
create policy "unidades_insert_authenticated" on public.unidades for insert to authenticated with check (auth.uid() is not null);
create policy "unidades_update_authenticated" on public.unidades for update to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "unidades_delete_authenticated" on public.unidades for delete to authenticated using (auth.uid() is not null);

create policy "convites_manage_admin" on public.convites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "designacoes_read_authenticated" on public.designacoes for select to authenticated using (true);
create policy "designacoes_manage_global" on public.designacoes for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());
create policy "designacao_quadras_read_authenticated" on public.designacao_quadras for select to authenticated using (true);
create policy "designacao_quadras_manage_global" on public.designacao_quadras for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());
create policy "designacao_publicadores_read_authenticated" on public.designacao_publicadores for select to authenticated using (true);
create policy "designacao_publicadores_manage_global" on public.designacao_publicadores for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());
create policy "designacao_locais_read_authenticated" on public.designacao_locais for select to authenticated using (true);
create policy "designacao_locais_manage_global" on public.designacao_locais for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());

create policy "tces_read_authenticated" on public.tces for select to authenticated using (true);
create policy "tces_manage_global" on public.tces for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());
create policy "tce_unidades_read_authenticated" on public.tce_unidades for select to authenticated using (true);
create policy "tce_unidades_manage_global" on public.tce_unidades for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());
create policy "designacao_tces_read_authenticated" on public.designacao_tces for select to authenticated using (true);
create policy "designacao_tces_manage_global" on public.designacao_tces for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());

create policy "arranjo_modalidades_read_authenticated" on public.arranjo_modalidades for select to authenticated using (true);
create policy "arranjo_modalidades_manage_global" on public.arranjo_modalidades for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());
create policy "arranjos_read_authenticated" on public.arranjos for select to authenticated using (true);
create policy "arranjos_manage_global" on public.arranjos for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());
create policy "arranjo_partes_read_authenticated" on public.arranjo_partes for select to authenticated using (true);
create policy "arranjo_partes_manage_global" on public.arranjo_partes for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());

create policy "registros_read_authenticated" on public.registros for select to authenticated using (true);
create policy "registros_insert_own" on public.registros for insert to authenticated
  with check (publicador_id is null or publicador_id = auth.uid() or public.is_dirigente_or_admin());
create policy "registros_update_own_or_global" on public.registros for update to authenticated
  using (publicador_id = auth.uid() or public.is_dirigente_or_admin())
  with check (publicador_id = auth.uid() or public.is_dirigente_or_admin());
create policy "registros_delete_own_or_global" on public.registros for delete to authenticated
  using (publicador_id = auth.uid() or public.is_dirigente_or_admin());

create policy "conclusoes_read_authenticated" on public.quadras_conclusoes for select to authenticated using (true);
create policy "conclusoes_insert_contextual" on public.quadras_conclusoes for insert to authenticated
  with check (marcado_por = auth.uid() and public.pode_concluir_quadra(quadra_id, auth.uid()));
create policy "conclusoes_delete_global" on public.quadras_conclusoes for delete to authenticated
  using (public.is_dirigente_or_admin());

create policy "curadoria_read_own_or_admin" on public.curadoria_edicoes for select to authenticated
  using (publicador_id = auth.uid() or public.is_admin());
create policy "curadoria_insert_own" on public.curadoria_edicoes for insert to authenticated
  with check (publicador_id = auth.uid() or public.is_admin());
create policy "curadoria_resolve_admin" on public.curadoria_edicoes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "curadoria_delete_admin" on public.curadoria_edicoes for delete to authenticated using (public.is_admin());

create policy "audit_read_admin" on public.audit_log for select to authenticated using (public.is_admin());
create policy "cartas_ciclos_read_authenticated" on public.cartas_ciclos for select to authenticated using (true);
create policy "cartas_ciclos_insert_authenticated" on public.cartas_ciclos for insert to authenticated
  with check (criado_por is null or criado_por = auth.uid() or public.is_dirigente_or_admin());
create policy "cartas_ciclos_manage_global" on public.cartas_ciclos for update to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());
create policy "cartas_ciclos_delete_global" on public.cartas_ciclos for delete to authenticated using (public.is_dirigente_or_admin());
create policy "campanhas_read_authenticated" on public.campanhas for select to authenticated using (true);
create policy "campanhas_manage_global" on public.campanhas for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());

-- Tokens nunca são enumeráveis por anon. Páginas públicas resolvem um UUID
-- específico por RPC SECURITY DEFINER.
create policy "territorio_tokens_read_authenticated" on public.territorio_tokens for select to authenticated using (true);
create policy "territorio_tokens_insert_contextual" on public.territorio_tokens for insert to authenticated
  with check (
    public.is_dirigente_or_admin()
    or (designacao_id is not null and public.participa_designacao(designacao_id, auth.uid()))
  );
create policy "territorio_tokens_delete_own_or_global" on public.territorio_tokens for delete to authenticated
  using (criado_por = auth.uid() or public.is_dirigente_or_admin());
create policy "cartas_tokens_read_authenticated" on public.cartas_tokens for select to authenticated using (true);
create policy "cartas_tokens_manage_global" on public.cartas_tokens for all to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());

create policy "notificacoes_read_own" on public.notificacoes for select to authenticated using (publicador_id = auth.uid());
create policy "notificacoes_update_own" on public.notificacoes for update to authenticated
  using (publicador_id = auth.uid()) with check (publicador_id = auth.uid());
create policy "notificacoes_delete_own" on public.notificacoes for delete to authenticated using (publicador_id = auth.uid());
create policy "notificacoes_insert_global" on public.notificacoes for insert to authenticated
  with check (public.is_dirigente_or_admin());
create policy "push_subscriptions_read_own" on public.push_subscriptions for select to authenticated using (publicador_id = auth.uid());
create policy "push_subscriptions_insert_own" on public.push_subscriptions for insert to authenticated with check (publicador_id = auth.uid());
create policy "push_subscriptions_delete_own" on public.push_subscriptions for delete to authenticated using (publicador_id = auth.uid());
create policy "erros_client_insert_own" on public.erros_client for insert to authenticated with check (publicador_id = auth.uid());
create policy "erros_client_read_admin" on public.erros_client for select to authenticated using (public.is_admin());
create policy "erros_client_delete_admin" on public.erros_client for delete to authenticated using (public.is_admin());
create policy "job_execucoes_service_only" on public.job_execucoes for all to service_role using (true) with check (true);
create policy "lembretes_enviados_service_only" on public.lembretes_enviados for all to service_role using (true) with check (true);

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
