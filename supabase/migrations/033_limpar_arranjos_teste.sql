-- ============================================================================
-- 033_limpar_arranjos_teste.sql — LIMPEZA DE TESTE (pré-produção).
-- Apaga todos os EVENTOS de arranjo (as saídas agendadas), mantendo as
-- MODALIDADES cadastradas (Cartas, Pregação, TP...).
-- Cascade limpa junto: arranjo_partes e territorio_tokens de arranjo.
-- ============================================================================

delete from arranjos;
-- arranjo_modalidades fica intacta
