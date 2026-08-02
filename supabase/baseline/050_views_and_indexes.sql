create or replace view public.quadras_geo with (security_invoker = on) as
select q.id, q.color, q.territorio_id, q.status, q.ativa, q.data_conclusao,
       q.notas, q.criado_em, q.atualizado_em,
       ST_AsGeoJSON(q.poly)::jsonb as poly_geojson, q.reservada_campanha_id,
       q.tipo_area, q.finalidade, q.origem_geografica, q.revisao_status, q.confianca
from public.quadras q;

create or replace view public.locais_geo with (security_invoker = on) as
select l.id, l.tipo, l.logradouro, l.numero, l.geo, l.quadra_id, l.setor,
       l.quadra_ibge, l.face_ibge, l.nome, l.irmao_mora, l.nome_irmao,
       l.notas, l.foto_url, l.tipo_entrada, l.acesso_caixas, l.acesso_interfones,
       l.nao_visitar, l.criado_em, l.atualizado_em, l.criado_por,
       case when l.geo is null then null else ST_AsGeoJSON(l.geo)::jsonb end as geo_geojson,
       l.nao_eh_predio, l.pendente, l.marcado_nao_existe, l.marcado_por,
       l.marcado_em, l.ordem_na_quadra, l.origem, l.origem_id, l.origem_edicao
from public.locais l;

create or replace view public.tces_geo with (security_invoker = on) as
select t.id, t.nome, t.tipo, t.publicador_id, t.prazo, t.status, t.criado_em,
       t.data_conclusao, t.notas, t.atualizado_em,
       case when t.poly is null then null else ST_AsGeoJSON(t.poly)::jsonb end as poly_geojson
from public.tces t;

create or replace view public.tces_com_quadras with (security_invoker = on) as
select t.id, t.nome, t.tipo, t.status, t.data_conclusao, t.prazo, t.publicador_id,
       coalesce(array_agg(distinct l.quadra_id) filter (where l.quadra_id is not null), '{}'::text[]) as quadras_ids
from public.tces t
left join public.tce_unidades tu on tu.tce_id = t.id
left join public.unidades u on u.id = tu.unidade_id
left join public.locais l on l.id = u.local_id
group by t.id;

create or replace view public.quadras_contagens with (security_invoker = on) as
select l.quadra_id, count(distinct l.id)::int as qtd_locais,
       coalesce(sum(uc.qtd_unidades), 0)::int as qtd_unidades
from public.locais l
left join (
  select local_id, count(*) as qtd_unidades from public.unidades group by local_id
) uc on uc.local_id = l.id
where l.marcado_nao_existe = false and l.quadra_id is not null
group by l.quadra_id;

grant select on public.quadras_geo, public.locais_geo, public.tces_geo,
  public.tces_com_quadras, public.quadras_contagens to authenticated;
