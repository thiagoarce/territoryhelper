-- 055: Cartas em DOIS momentos.
--
-- Momento 1 — ESCRITA (aba Cartas do /predio/[id]): o publicador marca
-- que a carta daquela unidade foi ESCRITA ("Carta escrita", antes
-- rotulado "Carta entregue"). `unidades.carta_entregue` (date) continua
-- sendo o campo que guarda a data — só a semântica/rótulo muda pra
-- "escrita". Nova coluna guarda QUEM escreveu, pra lista mostrar o nome.
--
-- Momento 2 — ENTREGA: é o desfecho "Deixou carta" do casa em casa
-- (registro tipo='carta' na trilha append-only), que na UI ganha
-- destaque quando a unidade tem carta escrita ainda não entregue.
-- Entrega por correio usa o mesmo botão (é o fallback de quando não dá
-- casa em casa).
--
-- Idempotente: pode rodar mais de uma vez.

alter table unidades
  add column if not exists carta_escrita_por uuid references profiles(id) on delete set null;

comment on column unidades.carta_escrita_por is
  'Quem marcou a carta como escrita (aba Cartas). Null quando marcado pelo link público /cartas/<token> (sem auth).';
