-- U7: reset de dados de teste — utilitário PERMANENTE (não é um script
-- de uso único). Roda manualmente pelo admin via /admin/dev/sql sempre
-- que precisar limpar uma rodada de testes, mantendo a estrutura viva
-- (território/quadras/endereços/catálogos). NÃO é uma migration (não
-- faz parte de supabase/migrations/ nem roda automaticamente).
--
-- MANUTENÇÃO: sempre que uma tabela nova entrar no schema, decidir se
-- ela é "trabalho de campo/instância" (entra na lista de DELETE) ou
-- "estrutura/catálogo" (fica de fora) e atualizar este arquivo — mesmo
-- critério documentado no comentário abaixo. Espelha `_tabelas.ts`
-- (backup) em cobertura de tabelas, mas com critério de MANTER vs
-- APAGAR em vez de "faz parte do backup ou não".
--
-- MANTÉM intactos: territórios, quadras (estrutura), endereços/unidades
-- (estrutura), TCEs (estrutura), profiles/convites, e todos os
-- catálogos (modalidades de arranjo, publicações, equipamento de TP,
-- pontos de TP, necessidade de revistas, preferência/disponibilidade
-- fixa dos publicadores).
--
-- `pontos_referencia` (migration 091) também FICA: é conhecimento da
-- congregação sobre a cidade ("Banco do Brasil da Fernando"), não dado
-- de uma rodada de teste — apagar obrigaria a recadastrar tudo à mão.
--
-- MANTÉM TAMBÉM o registro de quadras feitas (decisão do usuário):
-- `quadras_conclusoes` (histórico de conclusões) e
-- `quadras.data_conclusao` NÃO são tocados — o ciclo do casa em casa
-- (última conclusão da quadra) sobrevive ao reset. `quadra_lados_conclusoes`
-- (migration 092) segue a MESMA regra: apagar só os lados deixaria uma
-- quadra concluída mostrando "0 de 5 lados feitos", um estado incoerente.
--
-- APAGA histórico de trabalho de campo + designações/arranjos/TP de
-- teste (cascata cuida das tabelas filhas — arranjo_partes,
-- designacao_*, tp_agendamento_*, tp_relatorio_itens,
-- campanha_metas_pessoais, designacao_tces — listadas aqui mesmo
-- assim, por transparência, mesmo que o DELETE do pai já baste).
--
-- RESETA (não apaga a linha, só os campos de estado/trabalho):
-- quadras.reservada_campanha_id, unidades.carta_entregue/
-- carta_escrita_por, tces.status/publicador_id/prazo.

begin;

-- ── Histórico de trabalho de campo ──────────────────────────────────
-- (quadras_conclusoes fica de fora de propósito — ver cabeçalho)
delete from registros;
delete from curadoria_edicoes;
delete from notificacoes;

-- ── Designações / arranjos (cascata apaga as tabelas filhas) ────────
delete from designacao_quadras;
delete from designacao_publicadores;
delete from designacao_locais;
delete from designacao_tces;
delete from designacoes;

delete from arranjo_partes;
delete from arranjos;

delete from territorio_tokens;
delete from cartas_tokens;

-- ── TP: agendamentos/meses/relatórios (não os catálogos) ────────────
delete from tp_agendamento_excecoes;
delete from tp_agendamento_participantes;
delete from tp_agendamentos;
delete from tp_meses;
delete from tp_disponibilidade_mes;
delete from tp_disponibilidade_confirmacoes;
delete from tp_relatorio_itens;
delete from tp_relatorios;

-- ── Campanha (objetivos + período) ──────────────────────────────────
delete from campanha_suprimentos;
delete from campanha;
delete from campanhas;

-- ── Publicações: filas/controle de teste (mantém o catálogo) ────────
delete from pedidos_publicacao;
delete from publicacao_controle;

-- ── Reset de estado (mantém a linha, limpa só o "trabalho feito") ───
-- data_conclusao NÃO é zerada — é o registro de quadras feitas.
update quadras set reservada_campanha_id = null
where reservada_campanha_id is not null;

update unidades set carta_entregue = null, carta_escrita_por = null
where carta_entregue is not null or carta_escrita_por is not null;

update tces set status = 'aberto', publicador_id = null, prazo = null
where status <> 'aberto' or publicador_id is not null or prazo is not null;

-- Ciclo de cartas limpo — marca um novo início pra hoje pra ninguém
-- ficar preso com "carta escrita" de um ciclo de teste antigo. Usa
-- qualquer admin existente como autor.
insert into cartas_ciclos (iniciado_por)
select id from profiles where role = 'admin' limit 1;

commit;
