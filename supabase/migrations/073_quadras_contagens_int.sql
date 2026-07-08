-- 073: corrige tipo de retorno de quadras_contagens (migration 071).
-- count()/sum(bigint) devolvem bigint/numeric — PostgREST serializa esses
-- tipos como STRING no JSON (evita perda de precisão em números > 2^53).
-- MapLibre precisa de number nas expressions `interpolate`, então o modo
-- "densidade por residências"/"densidade por endereços" do mapa (que lê
-- qtd_locais/qtd_unidades como property do GeoJSON) ficava tudo cinza —
-- regressão introduzida pela própria view 071. Contagem por quadra nunca
-- chega perto do limite de int (2^31), então ::int é seguro e já sai como
-- number do PostgREST.
--
-- Postgres não deixa mudar o tipo de uma coluna de view existente via
-- CREATE OR REPLACE (precisa ser a mesma posição/tipo) — drop + recreate.
-- Nenhuma outra view/policy depende de quadras_contagens (só código da
-- aplicação via PostgREST), então é seguro.
drop view if exists quadras_contagens;
create view quadras_contagens
with (security_invoker = on)
as
select
  l.quadra_id,
  count(distinct l.id)::int as qtd_locais,
  coalesce(sum(uc.qtd_unidades), 0)::int as qtd_unidades
from locais l
left join (
  select local_id, count(*) as qtd_unidades
  from unidades
  group by local_id
) uc on uc.local_id = l.id
where l.marcado_nao_existe = false and l.quadra_id is not null
group by l.quadra_id;

grant select on quadras_contagens to authenticated;
