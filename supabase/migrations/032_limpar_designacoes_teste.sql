-- ============================================================================
-- 032_limpar_designacoes_teste.sql — LIMPEZA DE TESTE (pré-produção).
-- Apaga TUDO que aparece na aba Designações, sem apagar os eventos:
--   - designacoes (cascade limpa designacao_quadras, designacao_locais,
--     designacao_publicadores e territorio_tokens de designação)
--   - arranjo_partes (repartições feitas pelos dirigentes)
--   - o TERRITÓRIO anexado aos arranjos (quadras, prédios de cartas, TCE)
--     — os eventos em si (data, modalidade, dirigente, ponto) ficam.
-- Para apagar os eventos de arranjo, rodar a 033.
-- NÃO mexe em modalidades, quadras, locais, registros.
-- ============================================================================

delete from arranjo_partes;
delete from designacoes;

update arranjos set
  quadras_ids = '{}',
  cartas_locais_ids = '{}',
  tce_id = null;
