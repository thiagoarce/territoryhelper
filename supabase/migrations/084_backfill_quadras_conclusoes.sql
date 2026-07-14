-- 084: BACKFILL de quadras_conclusoes (execução única, roda como parte
-- da migration por conveniência — não cria/altera schema).
--
-- Bug corrigido no código nesta rodada: concluirQuadra
-- (/publicador/quadra/[id]) e concluirQuadraGrupo (/publicador/
-- casa-a-casa) — o caminho de conclusão em CAMPO usado pelo dirigente —
-- só atualizavam quadras.data_conclusao, nunca inseriam em
-- quadras_conclusoes. Só a ação equivalente em /admin (Geral) fazia as
-- duas coisas. Isso significa que toda quadra concluída pelo dirigente
-- em campo (não pelo admin manualmente) pode estar com data_conclusao
-- preenchida mas SEM entrada no histórico — invisível pro S-13, pro
-- dashboard e pra campanha, que leem inteiramente de
-- quadras_conclusoes.
--
-- Mesmo self-heal que /admin (Geral) já faz sob demanda ao concluir de
-- novo (marcarConcluidas, ver src/routes/admin/+page.server.ts) —
-- aqui rodado uma vez pra cobrir o que já ficou pra trás. Só insere
-- pra quadra que tem data_conclusao mas NENHUMA linha no histórico —
-- não mexe em quadra que já tem histórico (ainda que incompleto),
-- pra não inventar uma segunda entrada divergente da que já existe.
insert into quadras_conclusoes (quadra_id, data_conclusao)
select q.id, q.data_conclusao
from quadras q
where q.data_conclusao is not null
  and not exists (
    select 1 from quadras_conclusoes qc where qc.quadra_id = q.id
  );
