-- ============================================================================
-- 047_tp_pecas_codigo.sql — TP completo, ajuste pós-TP-A: o PDF oficial de
-- equipamentos (S-80-T) chegou depois da 041 e cada item tem um mnemônico
-- (ex: "ldcrt-1 (3516-1)") usado pra pedir pelo JW Hub. Adiciona um campo
-- pra guardar esse código — mesmo padrão de publicacoes.codigo (037).
--
-- Não guarda preço/dimensões: isso muda com o tempo e o app não tem
-- nenhum controle financeiro em lugar nenhum; o que importa pro relatório
-- de reposição é saber O QUE pedir — o preço atual mora no JW Hub.
-- ============================================================================

alter table tp_carrinho_tipos add column if not exists codigo text;
alter table tp_pecas_catalogo add column if not exists codigo text;
