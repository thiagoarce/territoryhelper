-- ============================================================================
-- 092_quadras_conclusoes_insert_rls.sql
--
-- Alinha a escrita do histórico ao contrato final da migration 090:
-- concluir uma quadra é poder de dirigente ou admin.
--
-- Desde a migration 019, `qc_insert_auth` aceitava INSERT de qualquer usuário
-- autenticado. A aplicação já restringia a action por role, mas uma chamada
-- direta ao PostgREST podia inserir linhas falsas ou gerar spam no histórico,
-- mesmo sem conseguir alterar `quadras.data_conclusao`.
--
-- Esta correção não impõe ainda `marcado_por = auth.uid()` para preservar
-- compatibilidade com o fluxo atual e com possíveis registros administrativos.
-- A autoria será endurecida separadamente depois de auditar todos os call sites.
-- ============================================================================

drop policy if exists qc_insert_auth on quadras_conclusoes;
drop policy if exists qc_insert_dirigente on quadras_conclusoes;

create policy qc_insert_dirigente
  on quadras_conclusoes
  for insert
  to authenticated
  with check (is_dirigente_or_admin());
