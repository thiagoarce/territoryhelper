-- 071: view que pré-agrega, em SQL, quantos endereços e quantas
-- residências/unidades cada quadra tem. Antes (`contarLocaisPorQuadra` /
-- `contarResidenciasPorQuadra` em queries.ts) isso era feito trazendo
-- TODAS as linhas de `locais` (duas vezes — uma em cada função) e TODAS
-- as linhas de `unidades` do banco inteiro pro Worker via `selectAll`
-- (paginação + dedup em JS), e então reduzido a Maps com um `for` em JS.
-- Pra uma congregação com milhares de endereços/unidades isso é um bloco
-- síncrono grande — chamado em TODA carga de /admin e /publicador (via
-- listarQuadrasComGeo) — candidato forte a contribuir com os estouros de
-- CPU do Cloudflare Workers observados em produção.
--
-- A view devolve só 1 linha por quadra (dezenas/centenas, não milhares),
-- com a contagem já pronta via GROUP BY — o Postgres faz o trabalho
-- pesado, não o Worker.
create or replace view quadras_contagens
with (security_invoker = on)
as
select
  l.quadra_id,
  count(distinct l.id) as qtd_locais,
  coalesce(sum(uc.qtd_unidades), 0) as qtd_unidades
from locais l
left join (
  select local_id, count(*) as qtd_unidades
  from unidades
  group by local_id
) uc on uc.local_id = l.id
where l.marcado_nao_existe = false and l.quadra_id is not null
group by l.quadra_id;

grant select on quadras_contagens to authenticated;
