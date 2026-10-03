-- 096: ponte entre a instância ORIGINAL (migrations 001–095) e a baseline
-- do Territory Installer (supabase/baseline/), pra que as duas rodem o
-- MESMO código do app a partir do main.
--
-- Escopo deliberadamente mínimo: só o que o código do app consulta e que
-- só existia na baseline. NÃO é "aplicar a baseline aqui" — a baseline
-- reescreveu nomes de policies e o modelo de autorização, e isso fica
-- fora (mudança grande demais pra uma instância em produção).
--
-- Efeito na instância original:
--   - toda quadra existente vira pregação regular, aprovada, alta
--     confiança (os defaults) — nada some de nenhuma tela;
--   - installation_config nasce com todos os módulos que ela já usa
--     ligados e o censo de idioma desligado;
--   - concluir quadra passa pela RPC registrar_conclusao_quadra, com a
--     MESMA regra do piloto: dirigente/admin em qualquer quadra, e o
--     titular (ou participante) de uma designação PESSOAL aberta nas
--     quadras dela (antes só dirigente/admin via tela);
--   - exclusão de local/unidade por não-admin passa a gerar uma entrada
--     "exclusao" na curadoria, que o admin consegue reverter.
--
-- Tudo numa transação: se qualquer passo falhar, nada muda.

begin;

-- 1. Metadados de área (baseline 035) ---------------------------------------
alter table public.quadras
  add column if not exists tipo_area text not null default 'urban-block',
  add column if not exists finalidade text not null default 'regular-preaching',
  add column if not exists origem_geografica text not null default 'imported',
  add column if not exists revisao_status text not null default 'approved',
  add column if not exists confianca text not null default 'high';

alter table public.quadras drop constraint if exists quadras_tipo_area_valido;
alter table public.quadras add constraint quadras_tipo_area_valido check (
  tipo_area in ('urban-block', 'rural-area', 'route', 'locality', 'condominium', 'isolated-point')
);
alter table public.quadras drop constraint if exists quadras_finalidade_valida;
alter table public.quadras add constraint quadras_finalidade_valida check (
  finalidade in ('regular-preaching', 'language-census')
);
alter table public.quadras drop constraint if exists quadras_origem_geografica_valida;
alter table public.quadras add constraint quadras_origem_geografica_valida check (
  origem_geografica in ('imported', 'osm-generated', 'cnefe-suggested', 'manual')
);
alter table public.quadras drop constraint if exists quadras_revisao_status_valido;
alter table public.quadras add constraint quadras_revisao_status_valido check (
  revisao_status in ('suggested', 'approved')
);
alter table public.quadras drop constraint if exists quadras_confianca_valida;
alter table public.quadras add constraint quadras_confianca_valida check (
  confianca in ('high', 'medium', 'low')
);

create index if not exists quadras_finalidade_revisao_idx
  on public.quadras(finalidade, revisao_status)
  where ativa;

-- O trigger quadras_guard_nao_admin (090) compara a linha inteira via
-- to_jsonb, então colunas novas ficam automaticamente protegidas contra
-- escrita de dirigente — nada a mudar nele.

-- 2. quadras_geo com as colunas novas no FIM ---------------------------------
-- DROP + CREATE em vez de CREATE OR REPLACE: a ordem atual das colunas
-- desta view em produção depende de como as migrations 020/034 foram
-- aplicadas à mão (ver o anti-padrão no CLAUDE.md), e o OR REPLACE falha
-- se a ordem não bater exatamente. Nada depende desta view.
drop view if exists public.quadras_geo;
create view public.quadras_geo with (security_invoker = on) as
select
  q.id, q.color, q.territorio_id, q.status, q.ativa, q.data_conclusao, q.notas,
  q.criado_em, q.atualizado_em,
  ST_AsGeoJSON(q.poly)::jsonb as poly_geojson,
  q.reservada_campanha_id,
  q.tipo_area, q.finalidade, q.origem_geografica, q.revisao_status, q.confianca
from public.quadras q;
grant select on public.quadras_geo to authenticated;

-- 3. Configuração da instalação (baseline 010 + 070) -------------------------
create table if not exists public.installation_config (
  singleton boolean primary key default true check (singleton),
  congregation_name text not null,
  timezone text not null default 'America/Sao_Paulo',
  operation_mode text not null default 'territorial' check (operation_mode in ('territorial', 'language')),
  modules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.installation_config enable row level security;
drop policy if exists config_read_authenticated on public.installation_config;
create policy config_read_authenticated on public.installation_config
  for select to authenticated using (true);
drop policy if exists config_manage_admin on public.installation_config;
create policy config_manage_admin on public.installation_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.installation_config to authenticated;

-- Com a linha gravada (e a chave languageCensus presente), o root layout
-- não precisa da consulta de descoberta em `quadras` a cada navegação.
insert into public.installation_config (singleton, congregation_name, modules)
values (true, 'Congregação', jsonb_build_object(
  'campaigns', true, 'publicWitnessing', true, 'publications', true, 'languageCensus', false
))
on conflict (singleton) do nothing;

-- 4. Curadoria de exclusões (baseline 040 + 060) -----------------------------
alter table public.curadoria_edicoes
  add column if not exists entidade text;
alter table public.curadoria_edicoes drop constraint if exists curadoria_edicoes_entidade_check;
alter table public.curadoria_edicoes add constraint curadoria_edicoes_entidade_check
  check (entidade in ('local', 'unidade'));
-- FKs como na baseline: SET NULL, não CASCADE. Com CASCADE o snapshot de
-- exclusão (gravado no BEFORE DELETE abaixo) sumia junto com o local que
-- ele descreve — nada pra reverter.
alter table public.curadoria_edicoes drop constraint if exists curadoria_edicoes_local_id_fkey;
alter table public.curadoria_edicoes add constraint curadoria_edicoes_local_id_fkey
  foreign key (local_id) references public.locais(id) on delete set null;
alter table public.curadoria_edicoes drop constraint if exists curadoria_edicoes_unidade_id_fkey;
alter table public.curadoria_edicoes add constraint curadoria_edicoes_unidade_id_fkey
  foreign key (unidade_id) references public.unidades(id) on delete set null;
alter table public.curadoria_edicoes drop constraint if exists curadoria_edicoes_tipo_check;
alter table public.curadoria_edicoes add constraint curadoria_edicoes_tipo_check
  check (tipo in ('edicao', 'criacao', 'nao_existe', 'exclusao'));

create or replace function public.curadoria_delete_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_snapshot jsonb; v_local_id bigint; v_unidade_id bigint;
begin
  if auth.uid() is not null and not public.is_admin() then
    -- A exclusão de um local apaga suas unidades em cascata. Guardamos o
    -- agregado numa única entrada e ignoramos os triggers filhos, para que
    -- a curadoria consiga restaurar a operação inteira sem duplicidade.
    if tg_table_name = 'unidades' and pg_trigger_depth() > 1 then return old; end if;
    -- Os ids saem de dentro do IF: `old.local_id` num CASE é resolvido
    -- mesmo no ramo não executado, e `locais` não tem essa coluna — o
    -- trigger abortava TODA exclusão de local por não-admin.
    if tg_table_name = 'locais' then
      v_local_id := old.id;
      v_snapshot := jsonb_build_object(
        'local', to_jsonb(old),
        'unidades', coalesce((select jsonb_agg(to_jsonb(u) order by u.id)
          from public.unidades u where u.local_id = old.id), '[]'::jsonb)
      );
    else
      v_local_id := old.local_id;
      v_unidade_id := old.id;
      v_snapshot := to_jsonb(old);
    end if;
    insert into public.curadoria_edicoes(local_id, unidade_id, publicador_id, tipo, entidade, antes)
    values (
      v_local_id,
      v_unidade_id,
      auth.uid(), 'exclusao', case when tg_table_name = 'locais' then 'local' else 'unidade' end,
      v_snapshot
    );
  end if;
  return old;
end;
$$;
drop trigger if exists curadoria_delete_local on public.locais;
create trigger curadoria_delete_local before delete on public.locais
  for each row execute function public.curadoria_delete_snapshot();
drop trigger if exists curadoria_delete_unidade on public.unidades;
create trigger curadoria_delete_unidade before delete on public.unidades
  for each row execute function public.curadoria_delete_snapshot();

-- 5. Conclusão de quadra por RPC (baseline 060) ------------------------------
create or replace function public.participa_designacao(p_designacao_id bigint, p_publicador_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.designacoes d
    where d.id = p_designacao_id and d.status = 'aberta'
      and (d.publicador_id = p_publicador_id or exists (
        select 1 from public.designacao_publicadores dp
        where dp.designacao_id = d.id and dp.publicador_id = p_publicador_id
      ))
  );
$$;

create or replace function public.pode_concluir_quadra(p_quadra_id text, p_publicador_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_dirigente_or_admin() or exists (
    select 1 from public.designacao_quadras dq
    join public.designacoes d on d.id = dq.designacao_id
    where dq.quadra_id = p_quadra_id and d.tipo = 'pessoal' and d.status = 'aberta'
      and public.participa_designacao(d.id, p_publicador_id)
  );
$$;

create or replace function public.registrar_conclusao_quadra(p_quadra_id text, p_data date, p_marcado_em timestamptz default null)
returns public.quadras_conclusoes language plpgsql security definer set search_path = public as $$
declare v_result public.quadras_conclusoes;
begin
  if auth.uid() is null or not public.pode_concluir_quadra(p_quadra_id, auth.uid()) then
    raise exception 'QUADRA_NOT_ASSIGNED';
  end if;
  insert into public.quadras_conclusoes(quadra_id, data_conclusao, marcado_por, marcado_em, hora_informada)
  values (p_quadra_id, p_data, auth.uid(), coalesce(p_marcado_em, now()), p_marcado_em is not null)
  returning * into v_result;
  update public.quadras set data_conclusao = greatest(coalesce(data_conclusao, p_data), p_data)
  where id = p_quadra_id;
  if not found then raise exception 'QUADRA_NOT_FOUND'; end if;
  return v_result;
end;
$$;

revoke execute on function public.participa_designacao(bigint, uuid) from public;
revoke execute on function public.pode_concluir_quadra(text, uuid) from public;
revoke execute on function public.registrar_conclusao_quadra(text, date, timestamptz) from public;
grant execute on function public.participa_designacao(bigint, uuid), public.pode_concluir_quadra(text, uuid),
  public.registrar_conclusao_quadra(text, date, timestamptz) to authenticated;

-- Inserção DIRETA no histórico (a tela Geral do admin ainda insere sem RPC,
-- inclusive o self-heal de backfill SEM marcado_por): antes qualquer
-- usuário logado podia inserir (`with check (true)`). Agora segue a mesma
-- regra da RPC; marcado_por, quando vem, tem que ser quem está logado.
drop policy if exists qc_insert_auth on public.quadras_conclusoes;
drop policy if exists conclusoes_insert_contextual on public.quadras_conclusoes;
create policy conclusoes_insert_contextual on public.quadras_conclusoes
  for insert to authenticated
  with check (
    (marcado_por is null or marcado_por = auth.uid())
    and public.pode_concluir_quadra(quadra_id, auth.uid())
  );

-- 6. Censo de idioma (baseline 065) — módulo desligado aqui, mas a tela e
--    as consultas existem no mesmo código; ficam prontas e inofensivas.
create or replace function public.resumo_censo_idioma()
returns jsonb language sql stable set search_path = public as $$
  with resumo as (
    select
      count(*)::int as total,
      count(*) filter (where revisao_status = 'approved')::int as aprovadas,
      count(*) filter (where revisao_status = 'suggested')::int as sugeridas,
      count(*) filter (where revisao_status = 'suggested' and confianca = 'high')::int as confiaveis,
      count(*) filter (where revisao_status = 'suggested' and confianca is distinct from 'high')::int as manual,
      ST_Extent(poly)::box3d as extensao
    from public.quadras
    where finalidade = 'language-census'
  )
  select jsonb_build_object(
    'total', total, 'aprovadas', aprovadas, 'sugeridas', sugeridas,
    'confiaveis', confiaveis, 'manual', manual,
    'bounds', case when extensao is null then null else jsonb_build_array(
      ST_XMin(extensao), ST_YMin(extensao), ST_XMax(extensao), ST_YMax(extensao)
    ) end
  )
  from resumo;
$$;

create or replace function public.areas_censo_viewport(
  p_west double precision, p_south double precision, p_east double precision, p_north double precision,
  p_filtro text default 'pendentes', p_limite integer default 1500
) returns table (
  id text, color text, territorio_id text, status text, ativa boolean, data_conclusao date, notas text,
  reservada_campanha_id bigint, tipo_area text, finalidade text, origem_geografica text,
  revisao_status text, confianca text, poly_geojson jsonb, total_viewport bigint
) language sql stable set search_path = public as $$
  with candidatas as (
    select q.*
    from public.quadras q
    where q.finalidade = 'language-census'
      and q.poly && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)
      and ST_Intersects(q.poly, ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326))
      and case
        when p_filtro = 'manual' then q.revisao_status = 'suggested' and q.confianca is distinct from 'high'
        when p_filtro = 'todas' then true
        else q.revisao_status = 'suggested'
      end
  ), paginadas as (
    select c.*, count(*) over () as total_viewport
    from candidatas c
    order by c.id
    limit greatest(1, least(coalesce(p_limite, 1500), 2000))
  )
  select p.id, p.color, p.territorio_id, p.status, p.ativa, p.data_conclusao, p.notas,
    p.reservada_campanha_id, p.tipo_area, p.finalidade, p.origem_geografica, p.revisao_status,
    p.confianca, ST_AsGeoJSON(p.poly)::jsonb, p.total_viewport
  from paginadas p
  order by p.id;
$$;

revoke execute on function public.resumo_censo_idioma() from public;
revoke execute on function public.areas_censo_viewport(double precision, double precision, double precision, double precision, text, integer) from public;
grant execute on function public.resumo_censo_idioma(),
  public.areas_censo_viewport(double precision, double precision, double precision, double precision, text, integer)
  to authenticated;

commit;
