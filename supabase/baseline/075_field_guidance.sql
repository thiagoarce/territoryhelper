-- Recursos de orientação em campo consolidados a partir das migrations
-- 091–095. Este módulo pertence à baseline curta: pode ser reaplicado e
-- também atualiza instalações do piloto que receberam a baseline anterior.

create table if not exists public.pontos_referencia (
  id bigserial primary key,
  nome text not null,
  tipo text not null default 'referencia'
    check (tipo in ('estacionamento', 'referencia', 'entrada', 'atencao')),
  geo geometry(Point, 4326) not null,
  notas text,
  quadra_id text references public.quadras(id) on delete set null,
  territorio_id text references public.territorios(id) on delete set null,
  osm_id text,
  ativo boolean not null default true,
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now(),
  status text not null default 'validado'
    check (status in ('sugerido', 'validado')),
  maps_url text,
  endereco text
);

-- Compatibilidade com uma instalação que já tenha recebido a migration 091.
alter table public.pontos_referencia add column if not exists status text not null default 'validado';
alter table public.pontos_referencia add column if not exists maps_url text;
alter table public.pontos_referencia add column if not exists endereco text;
do $$ begin
  alter table public.pontos_referencia add constraint pontos_referencia_status_check
    check (status in ('sugerido', 'validado')) not valid;
exception when duplicate_object then null;
end $$;

create index if not exists pontos_referencia_geo_gist
  on public.pontos_referencia using gist(geo);
create index if not exists pontos_referencia_quadra_idx
  on public.pontos_referencia(quadra_id);
create index if not exists pontos_referencia_territorio_idx
  on public.pontos_referencia(territorio_id);
create unique index if not exists pontos_referencia_osm_uniq
  on public.pontos_referencia(osm_id) where osm_id is not null;

create table if not exists public.ponto_referencia_territorios (
  ponto_id bigint not null references public.pontos_referencia(id) on delete cascade,
  territorio_id text not null references public.territorios(id) on delete cascade,
  primary key (ponto_id, territorio_id)
);
create index if not exists prt_territorio_idx
  on public.ponto_referencia_territorios(territorio_id);

insert into public.ponto_referencia_territorios (ponto_id, territorio_id)
select id, territorio_id from public.pontos_referencia
where territorio_id is not null
on conflict do nothing;

create table if not exists public.quadra_lados_conclusoes (
  id bigserial primary key,
  quadra_id text not null references public.quadras(id) on delete cascade,
  lado_chave text not null,
  lado_rotulo text not null,
  data_conclusao date not null,
  marcado_por uuid references public.profiles(id) on delete set null,
  marcado_em timestamptz not null default now(),
  hora_informada boolean not null default false
);
create index if not exists qlc_quadra_lado_idx
  on public.quadra_lados_conclusoes(quadra_id, lado_chave, data_conclusao desc);
create unique index if not exists qlc_uniq
  on public.quadra_lados_conclusoes(quadra_id, lado_chave, data_conclusao);

create or replace view public.pontos_referencia_geo
with (security_invoker = on) as
select
  id, nome, tipo, notas, quadra_id, territorio_id, osm_id,
  ativo, criado_por, criado_em,
  ST_AsGeoJSON(geo)::jsonb as geo_geojson,
  status, maps_url, endereco
from public.pontos_referencia;

alter table public.pontos_referencia enable row level security;
alter table public.ponto_referencia_territorios enable row level security;
alter table public.quadra_lados_conclusoes enable row level security;

drop policy if exists pr_select_auth on public.pontos_referencia;
create policy pr_select_auth on public.pontos_referencia
  for select to authenticated using (true);
drop policy if exists pr_write_dirigente on public.pontos_referencia;
drop policy if exists pr_write_admin on public.pontos_referencia;
create policy pr_write_admin on public.pontos_referencia
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists pr_sugerir_dirigente on public.pontos_referencia;
create policy pr_sugerir_dirigente on public.pontos_referencia
  for insert to authenticated with check (
    public.is_dirigente_or_admin()
    and status = 'sugerido'
    and criado_por = auth.uid()
  );

drop policy if exists prt_select_auth on public.ponto_referencia_territorios;
create policy prt_select_auth on public.ponto_referencia_territorios
  for select to authenticated using (true);
drop policy if exists prt_write_admin on public.ponto_referencia_territorios;
create policy prt_write_admin on public.ponto_referencia_territorios
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists qlc_select_auth on public.quadra_lados_conclusoes;
create policy qlc_select_auth on public.quadra_lados_conclusoes
  for select to authenticated using (true);
drop policy if exists qlc_insert_auth on public.quadra_lados_conclusoes;
create policy qlc_insert_auth on public.quadra_lados_conclusoes
  for insert to authenticated with check (true);
drop policy if exists qlc_delete_dirigente on public.quadra_lados_conclusoes;
create policy qlc_delete_dirigente on public.quadra_lados_conclusoes
  for delete to authenticated using (public.is_dirigente_or_admin());

-- A baseline antiga permitia gerenciamento completo de arranjos ao dirigente.
-- Agora ele só pode finalizar a saída ou assumir a dirigência; o trigger
-- protege automaticamente qualquer coluna nova que surja no futuro.
create or replace function public.arranjos_guard_nao_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if (to_jsonb(new) - 'ativo' - 'dirigente_id' - 'atualizado_em')
     is distinct from
     (to_jsonb(old) - 'ativo' - 'dirigente_id' - 'atualizado_em') then
    raise exception 'ARRANJO_STRUCTURAL_CHANGE_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

drop trigger if exists arranjos_guard_nao_admin on public.arranjos;
create trigger arranjos_guard_nao_admin before update on public.arranjos
for each row execute function public.arranjos_guard_nao_admin();

drop policy if exists "arranjos_manage_global" on public.arranjos;
drop policy if exists "arranjos_manage_admin" on public.arranjos;
create policy "arranjos_manage_admin" on public.arranjos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "arranjos_update_dirigente" on public.arranjos;
create policy "arranjos_update_dirigente" on public.arranjos for update to authenticated
  using (public.is_dirigente_or_admin()) with check (public.is_dirigente_or_admin());

-- O link público recebe o pacote completo usado pela tela atual: quadras,
-- prédios, território comercial, pontos validados e contexto do entorno.
create or replace function public.territorio_publico(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t record;
  resultado jsonb;
  raio_vizinhas_m constant integer := 250;
  raio_pontos_m constant integer := 300;
begin
  select * into t from public.territorio_tokens
    where token = p_token and (expira_em is null or expira_em > now());
  if not found then return null; end if;

  if t.arranjo_id is not null then
    select jsonb_build_object(
      'tipo', 'arranjo',
      'titulo', coalesce(a.nome, 'Arranjo'),
      'data', a.data,
      'hora_inicio', a.hora_inicio,
      'local_endereco', a.local_endereco,
      'notas', a.notas,
      'quadras', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'color', q.color,
          'poly_geojson', ST_AsGeoJSON(q.poly)::jsonb)), '[]'::jsonb)
        from public.quadras q where q.id = any(coalesce(a.quadras_ids, '{}'))
      ),
      'predios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', l.id, 'nome', l.nome, 'logradouro', l.logradouro,
          'numero', l.numero,
          'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb)), '[]'::jsonb)
        from public.locais l where l.id = any(coalesce(a.cartas_locais_ids, '{}'))
      ),
      'tces', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', tc.id, 'nome', tc.nome,
          'poly_geojson', ST_AsGeoJSON(tc.poly)::jsonb)), '[]'::jsonb)
        from public.tces tc where tc.id = any(coalesce(a.tces_ids, '{}'))
      ),
      'tce_comercios', (
        select coalesce(jsonb_agg(distinct jsonb_build_object(
          'id', l.id, 'nome', l.nome, 'logradouro', l.logradouro,
          'numero', l.numero,
          'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb)), '[]'::jsonb)
        from public.tce_unidades tu
        join public.unidades u on u.id = tu.unidade_id
        join public.locais l on l.id = u.local_id
        where tu.tce_id = any(coalesce(a.tces_ids, '{}')) and l.geo is not null
      ),
      'pontos', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pr.id, 'nome', pr.nome, 'tipo', pr.tipo, 'notas', pr.notas,
          'maps_url', pr.maps_url,
          'geo_geojson', ST_AsGeoJSON(pr.geo)::jsonb)), '[]'::jsonb)
        from public.pontos_referencia pr
        where pr.ativo and pr.status = 'validado' and (
          pr.quadra_id = any(coalesce(a.quadras_ids, '{}'))
          or exists (
            select 1 from public.ponto_referencia_territorios prt
            where prt.ponto_id = pr.id and prt.territorio_id in (
              select distinct q2.territorio_id from public.quadras q2
              where q2.id = any(coalesce(a.quadras_ids, '{}')) and q2.territorio_id is not null
            )
          )
          or ST_DWithin(
            pr.geo::geography,
            (select ST_Union(q3.poly) from public.quadras q3
              where q3.id = any(coalesce(a.quadras_ids, '{}')))::geography,
            raio_pontos_m
          )
        )
      ),
      'contexto', jsonb_build_object(
        'territorios', coalesce((
          select jsonb_agg(jsonb_build_object('id', tr.id, 'nome', tr.nome) order by tr.id)
          from public.territorios tr where tr.id in (
            select distinct q2.territorio_id from public.quadras q2
            where q2.id = any(coalesce(a.quadras_ids, '{}')) and q2.territorio_id is not null
          )
        ), '[]'::jsonb),
        'quadras', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', qq.id, 'territorio_id', qq.territorio_id,
            'data_conclusao', qq.data_conclusao,
            'poly_geojson', ST_AsGeoJSON(qq.poly)::jsonb))
          from public.quadras qq where qq.ativa and (
            qq.territorio_id in (
              select distinct q2.territorio_id from public.quadras q2
              where q2.id = any(coalesce(a.quadras_ids, '{}')) and q2.territorio_id is not null
            )
            or ST_DWithin(
              qq.poly::geography,
              (select ST_Union(q3.poly) from public.quadras q3
                where q3.id = any(coalesce(a.quadras_ids, '{}')))::geography,
              raio_vizinhas_m
            )
          )
        ), '[]'::jsonb)
      )
    ) into resultado from public.arranjos a where a.id = t.arranjo_id;
  else
    select jsonb_build_object(
      'tipo', 'designacao',
      'titulo', coalesce(p.nome, 'Território pessoal'),
      'prazo', d.prazo,
      'notas', d.notas,
      'quadras', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'color', q.color,
          'poly_geojson', ST_AsGeoJSON(q.poly)::jsonb)), '[]'::jsonb)
        from public.designacao_quadras dq
        join public.quadras q on q.id = dq.quadra_id
        where dq.designacao_id = d.id
      ),
      'predios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', l.id, 'nome', l.nome, 'logradouro', l.logradouro,
          'numero', l.numero,
          'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb)), '[]'::jsonb)
        from public.designacao_locais dl
        join public.locais l on l.id = dl.local_id
        where dl.designacao_id = d.id
      ),
      'tces', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', tc.id, 'nome', tc.nome,
          'poly_geojson', ST_AsGeoJSON(tc.poly)::jsonb)), '[]'::jsonb)
        from public.designacao_tces dt
        join public.tces tc on tc.id = dt.tce_id
        where dt.designacao_id = d.id
      ),
      'tce_comercios', (
        select coalesce(jsonb_agg(distinct jsonb_build_object(
          'id', l.id, 'nome', l.nome, 'logradouro', l.logradouro,
          'numero', l.numero,
          'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb)), '[]'::jsonb)
        from public.designacao_tces dt
        join public.tce_unidades tu on tu.tce_id = dt.tce_id
        join public.unidades u on u.id = tu.unidade_id
        join public.locais l on l.id = u.local_id
        where dt.designacao_id = d.id and l.geo is not null
      ),
      'pontos', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', pr.id, 'nome', pr.nome, 'tipo', pr.tipo, 'notas', pr.notas,
          'maps_url', pr.maps_url,
          'geo_geojson', ST_AsGeoJSON(pr.geo)::jsonb)), '[]'::jsonb)
        from public.pontos_referencia pr
        where pr.ativo and pr.status = 'validado' and (
          pr.quadra_id in (
            select dq3.quadra_id from public.designacao_quadras dq3 where dq3.designacao_id = d.id
          )
          or exists (
            select 1 from public.ponto_referencia_territorios prt
            where prt.ponto_id = pr.id and prt.territorio_id in (
              select distinct q2.territorio_id
              from public.designacao_quadras dq2
              join public.quadras q2 on q2.id = dq2.quadra_id
              where dq2.designacao_id = d.id and q2.territorio_id is not null
            )
          )
          or ST_DWithin(
            pr.geo::geography,
            (select ST_Union(q3.poly) from public.designacao_quadras dq3
              join public.quadras q3 on q3.id = dq3.quadra_id
              where dq3.designacao_id = d.id)::geography,
            raio_pontos_m
          )
        )
      ),
      'contexto', jsonb_build_object(
        'territorios', coalesce((
          select jsonb_agg(jsonb_build_object('id', tr.id, 'nome', tr.nome) order by tr.id)
          from public.territorios tr where tr.id in (
            select distinct q2.territorio_id
            from public.designacao_quadras dq2
            join public.quadras q2 on q2.id = dq2.quadra_id
            where dq2.designacao_id = d.id and q2.territorio_id is not null
          )
        ), '[]'::jsonb),
        'quadras', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', qq.id, 'territorio_id', qq.territorio_id,
            'data_conclusao', qq.data_conclusao,
            'poly_geojson', ST_AsGeoJSON(qq.poly)::jsonb))
          from public.quadras qq where qq.ativa and (
            qq.territorio_id in (
              select distinct q2.territorio_id
              from public.designacao_quadras dq2
              join public.quadras q2 on q2.id = dq2.quadra_id
              where dq2.designacao_id = d.id and q2.territorio_id is not null
            )
            or ST_DWithin(
              qq.poly::geography,
              (select ST_Union(q3.poly)
                from public.designacao_quadras dq3
                join public.quadras q3 on q3.id = dq3.quadra_id
                where dq3.designacao_id = d.id)::geography,
              raio_vizinhas_m
            )
          )
        ), '[]'::jsonb)
      )
    ) into resultado
    from public.designacoes d
    left join public.profiles p on p.id = d.publicador_id
    where d.id = t.designacao_id;
  end if;

  return resultado;
end;
$$;

grant select on public.pontos_referencia_geo to authenticated;
grant select, insert, update, delete on public.pontos_referencia,
  public.ponto_referencia_territorios, public.quadra_lados_conclusoes to authenticated;
grant usage, select on sequence public.pontos_referencia_id_seq,
  public.quadra_lados_conclusoes_id_seq to authenticated;
revoke execute on function public.territorio_publico(uuid) from public;
grant execute on function public.territorio_publico(uuid) to anon, authenticated;
