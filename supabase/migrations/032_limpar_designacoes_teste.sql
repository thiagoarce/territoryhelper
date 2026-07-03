-- ============================================================================
-- 032_limpar_designacoes_teste.sql — LIMPEZA DE TESTE (pré-produção).
-- Apaga TODAS as designações e tudo que foi "designado" via arranjo:
--   - designacoes (cascade limpa designacao_quadras, designacao_locais,
--     designacao_publicadores e territorio_tokens de designação)
--   - arranjo_partes (repartições feitas pelos dirigentes)
-- NÃO mexe em arranjos, modalidades, quadras, locais, registros.
-- ============================================================================

delete from arranjo_partes;
delete from designacoes;
