-- 070: view que pré-agrega, em SQL, quais quadras cada TCE toca (via
-- tce_unidades -> unidades -> locais.quadra_id). Antes isso era um embed
-- PostgREST triplo (tces -> tce_unidades -> unidades -> locais) trazido
-- inteiro pro Worker e reduzido a um Set em JS, um bloco síncrono grande o
-- suficiente pra contribuir com estouros de CPU no Cloudflare Workers
-- (free tier) na rota /admin. Mover o array_agg pro Postgres elimina o
-- payload aninhado e o loop de Set-building no load().
create or replace view tces_com_quadras
with (security_invoker = on)
as
select
  t.id,
  t.nome,
  t.tipo,
  t.status,
  t.prazo,
  t.publicador_id,
  coalesce(
    array_agg(distinct l.quadra_id) filter (where l.quadra_id is not null),
    '{}'::text[]
  ) as quadras_ids
from tces t
left join tce_unidades tu on tu.tce_id = t.id
left join unidades u on u.id = tu.unidade_id
left join locais l on l.id = u.local_id
group by t.id;

grant select on tces_com_quadras to authenticated;
