-- T13 (A7): locais_geo (migration 012) usava `l.*` e ficou congelada nas
-- colunas que existiam na hora — nunca foi recriada, então nao_eh_predio,
-- pendente, marcado_nao_existe, marcado_por, marcado_em e ordem_na_quadra
-- (todas adicionadas depois, em migrations posteriores) nunca apareceram
-- na view. `carregarQuadraComLocais` lê dessa view por padrão, então
-- marcado_nao_existe (que a T13 precisa pra esmaecer o endereço) nunca
-- chegava no front nesse caminho.
--
-- CUIDADO (ver CLAUDE.md): `create or replace view` só aceita coluna nova
-- no FINAL da lista. Por isso listamos as colunas ORIGINAIS explicitamente
-- (mesma ordem de sempre, sem `l.*`) e colocamos as novas DEPOIS de
-- geo_geojson — nunca no meio.
create or replace view locais_geo
with (security_invoker = on)
as
select
  l.id,
  l.tipo,
  l.logradouro,
  l.numero,
  l.geo,
  l.quadra_id,
  l.setor,
  l.quadra_ibge,
  l.face_ibge,
  l.nome,
  l.irmao_mora,
  l.nome_irmao,
  l.notas,
  l.foto_url,
  l.tipo_entrada,
  l.acesso_caixas,
  l.acesso_interfones,
  l.nao_visitar,
  l.criado_em,
  l.atualizado_em,
  l.criado_por,
  case
    when l.geo is not null then ST_AsGeoJSON(l.geo)::jsonb
    else null
  end as geo_geojson,
  l.nao_eh_predio,
  l.pendente,
  l.marcado_nao_existe,
  l.marcado_por,
  l.marcado_em,
  l.ordem_na_quadra
from locais l;

grant select on locais_geo to authenticated;
