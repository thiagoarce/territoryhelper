-- 077: índice puro em ts pro audit_log. A tela de Auditoria sem filtro
-- roda `order by ts desc limit 100` — os índices existentes começam por
-- (tabela, ...) ou (autor_id, ...) e não servem pra ordenação global por
-- ts, então o Postgres varria a tabela INTEIRA (que cresce a cada
-- UPDATE do banco — import de endereços incluso) e estourava o
-- statement_timeout → PostgREST 500. Com o índice, vira um index scan
-- que para nas 100 primeiras linhas.
create index if not exists audit_log_ts_idx on audit_log (ts desc);
