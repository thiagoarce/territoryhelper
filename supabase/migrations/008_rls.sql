-- ============================================================================
-- 008_rls.sql — Todas as Row Level Security policies em um lugar só.
-- Fácil revisar segurança e ajustar conforme features amadurecem.
--
-- Conceito geral:
--   - territorios/quadras: read todos autenticados; write admin
--   - locais/unidades: read todos; write authenticated (publicador edita
--     overlay; refinaremos com escopo "minha designação" no futuro)
--   - registros: read todos; insert authenticated; update/delete só admin
--   - designacoes/tces: admin tudo + publicador vê as próprias
--   - convites: só admin (ler+criar+editar)
--   - audit_log: só admin lê
-- ============================================================================

alter table territorios enable row level security;
alter table quadras enable row level security;
alter table locais enable row level security;
alter table unidades enable row level security;
alter table designacoes enable row level security;
alter table designacao_quadras enable row level security;
alter table tces enable row level security;
alter table tce_unidades enable row level security;
alter table registros enable row level security;
alter table campanha enable row level security;
alter table convites enable row level security;
alter table arranjos enable row level security;
alter table arranjo_membros enable row level security;
alter table audit_log enable row level security;

-- ----------------------------------------------------------------------------
-- Territórios + Quadras: público pra leitura entre autenticados
-- ----------------------------------------------------------------------------
create policy "territorios_read" on territorios for select to authenticated using (true);
create policy "territorios_admin_write" on territorios for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "quadras_read" on quadras for select to authenticated using (true);
create policy "quadras_admin_write" on quadras for all to authenticated
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Locais + Unidades: publicador pode editar overlay (carta, desocupado, etc).
-- Refinaremos pra "só nas minhas designações" quando porta a UI.
-- ----------------------------------------------------------------------------
create policy "locais_read" on locais for select to authenticated using (true);
create policy "locais_insert_admin" on locais for insert to authenticated
  with check (is_admin());
create policy "locais_update_authenticated" on locais for update to authenticated
  using (true) with check (true);
create policy "locais_delete_admin" on locais for delete to authenticated
  using (is_admin());

create policy "unidades_read" on unidades for select to authenticated using (true);
create policy "unidades_insert_admin" on unidades for insert to authenticated
  with check (is_admin());
create policy "unidades_update_authenticated" on unidades for update to authenticated
  using (true) with check (true);
create policy "unidades_delete_admin" on unidades for delete to authenticated
  using (is_admin());

-- ----------------------------------------------------------------------------
-- Designações: admin vê tudo; publicador vê só as próprias.
-- designacao_quadras herda via JOIN (controlamos pelo lado de designacoes).
-- ----------------------------------------------------------------------------
create policy "designacoes_admin_all" on designacoes for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "designacoes_publicador_propria" on designacoes for select to authenticated
  using (publicador_id = auth.uid());

create policy "designacao_quadras_admin_all" on designacao_quadras for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "designacao_quadras_publicador_propria" on designacao_quadras for select to authenticated
  using (
    exists (
      select 1 from designacoes d
      where d.id = designacao_quadras.designacao_id
        and d.publicador_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- TCEs: admin tudo; publicador vê só as próprias.
-- ----------------------------------------------------------------------------
create policy "tces_admin_all" on tces for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "tces_publicador_proprio" on tces for select to authenticated
  using (publicador_id = auth.uid());

create policy "tce_unidades_admin_all" on tce_unidades for all to authenticated
  using (is_admin()) with check (is_admin());
create policy "tce_unidades_publicador_proprio" on tce_unidades for select to authenticated
  using (
    exists (
      select 1 from tces t
      where t.id = tce_unidades.tce_id
        and t.publicador_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- Registros: todos leem, todos autenticados inserem (publicador grava
-- desfecho/carta). Só admin pode editar/excluir registros antigos.
-- ----------------------------------------------------------------------------
create policy "registros_read" on registros for select to authenticated using (true);
create policy "registros_insert_authenticated" on registros for insert to authenticated
  with check (true);
create policy "registros_admin_update" on registros for update to authenticated
  using (is_admin()) with check (is_admin());
create policy "registros_admin_delete" on registros for delete to authenticated
  using (is_admin());

-- ----------------------------------------------------------------------------
-- Campanha: admin escreve; público de leitura entre autenticados.
-- Itens com publico=true poderiam ser expostos pra anon, mas faremos isso
-- via endpoint dedicado se precisar.
-- ----------------------------------------------------------------------------
create policy "campanha_read" on campanha for select to authenticated using (true);
create policy "campanha_admin_write" on campanha for all to authenticated
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Convites: só admin.
-- O endpoint de "aceitar convite" usa service_role pra validar o token
-- (porque o irmão ainda não tem profile/sessão).
-- ----------------------------------------------------------------------------
create policy "convites_admin_all" on convites for all to authenticated
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Arranjos: todos leem; admin escreve (futuro: líder do arranjo edita o próprio)
-- ----------------------------------------------------------------------------
create policy "arranjos_read" on arranjos for select to authenticated using (true);
create policy "arranjos_admin_write" on arranjos for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "arranjo_membros_read" on arranjo_membros for select to authenticated using (true);
create policy "arranjo_membros_admin_write" on arranjo_membros for all to authenticated
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Audit log: só admin lê. Ninguém escreve diretamente (trigger faz isso
-- via security definer, que bypassa RLS).
-- ----------------------------------------------------------------------------
create policy "audit_log_admin_read" on audit_log for select to authenticated
  using (is_admin());
