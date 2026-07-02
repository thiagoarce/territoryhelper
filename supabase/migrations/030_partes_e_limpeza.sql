-- ============================================================================
-- 030_partes_e_limpeza.sql — Grande limpeza do modelo de designações.
--
-- Modelo alvo:
--   DESIGNAÇÃO  = território pessoal (publicador_id sempre; sem dirigente).
--                 Morre o tipo 'arranjo'.
--   ARRANJO     = saída agendada com dirigente + território MISTO livre
--                 (quadras + prédios + TCE + ponto — qualquer combinação).
--   PARTE       = subconjunto do território do arranjo repartido pelo
--                 dirigente pra 1+ publicadores (dupla/trio veem a MESMA
--                 parte). Substitui delegacoes_temp e distribuirQuadras.
--   TOKEN       = link público /t/<token> (sem login) de arranjo ou
--                 designação, com mapa — pra mandar por WhatsApp.
--
-- Banco é de TESTE (pré-produção): designações existentes são apagadas.
-- ============================================================================

-- 1) Limpeza: apaga TODAS as designações de teste (cascade limpa junções)
delete from designacoes;

-- Trava o tipo pra só os valores novos
do $$
begin
  alter table designacoes drop constraint if exists designacoes_tipo_check;
  alter table designacoes add constraint designacoes_tipo_check
    check (tipo in ('pessoal', 'cartas'));
exception when others then null;
end $$;

-- 2) Arranjo misto: TCE entra no território
alter table arranjos add column if not exists tce_id text references tces(id) on delete set null;

-- 3) Partes de arranjo (repartição do dirigente)
create table if not exists arranjo_partes (
  id bigserial primary key,
  arranjo_id bigint not null references arranjos(id) on delete cascade,
  quadras_ids text[] not null default '{}',
  locais_ids bigint[] not null default '{}',
  publicadores uuid[] not null default '{}',   -- dupla/trio: mesma parte
  notas text,
  criado_por uuid references profiles(id) on delete set null,
  criada_em timestamptz not null default now()
);

create index if not exists arranjo_partes_arranjo_idx on arranjo_partes(arranjo_id);

alter table arranjo_partes enable row level security;

drop policy if exists arranjo_partes_select on arranjo_partes;
create policy arranjo_partes_select on arranjo_partes
  for select to authenticated
  using (
    auth.uid() = any(publicadores)
    or is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
  );

drop policy if exists arranjo_partes_write on arranjo_partes;
create policy arranjo_partes_write on arranjo_partes
  for all to authenticated
  using (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
  )
  with check (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
  );

-- 4) pode_editar_local v4: troca delegacoes_temp por arranjo_partes
create or replace function pode_editar_local(p_local_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    is_admin()
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('admin','dirigente')
    )
    or exists (
      -- designação pessoal cobrindo a quadra do local
      select 1
      from locais l
      join designacao_quadras dq on dq.quadra_id = l.quadra_id
      join designacoes d on d.id = dq.designacao_id
      where l.id = p_local_id
        and d.publicador_id = auth.uid()
        and d.status = 'aberta'
    )
    or exists (
      -- designação de cartas (prédio designado direto)
      select 1
      from designacao_locais dl
      join designacoes d on d.id = dl.designacao_id
      where dl.local_id = p_local_id
        and d.publicador_id = auth.uid()
        and d.status = 'aberta'
    )
    or exists (
      -- parte de arranjo ativa que me inclui (pela quadra do local OU pelo local)
      select 1
      from arranjo_partes pt
      join arranjos a on a.id = pt.arranjo_id
      join locais l on l.id = p_local_id
      where auth.uid() = any(pt.publicadores)
        and a.ativo = true
        and a.data >= current_date - 1
        and (l.quadra_id = any(pt.quadras_ids) or pt.locais_ids @> array[p_local_id])
    )
    or exists (
      -- prédio dentro de arranjo de cartas ativo (saída de grupo)
      select 1
      from arranjos a
      where a.ativo = true
        and a.cartas_locais_ids @> array[p_local_id]
    );
$$;

-- 5) delegacoes_temp morre (substituída por arranjo_partes; dados eram teste)
drop table if exists delegacoes_temp;

-- 6) Link público de território (arranjo OU designação) — /t/<token>
create table if not exists territorio_tokens (
  token uuid primary key default gen_random_uuid(),
  designacao_id bigint references designacoes(id) on delete cascade,
  arranjo_id bigint references arranjos(id) on delete cascade,
  criado_por uuid references profiles(id) on delete set null,
  criada_em timestamptz not null default now(),
  expira_em timestamptz,
  check (num_nonnulls(designacao_id, arranjo_id) = 1)
);

alter table territorio_tokens enable row level security;

drop policy if exists territorio_tokens_select on territorio_tokens;
create policy territorio_tokens_select on territorio_tokens
  for select to anon, authenticated using (true);

drop policy if exists territorio_tokens_insert on territorio_tokens;
create policy territorio_tokens_insert on territorio_tokens
  for insert to authenticated
  with check (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
    -- publicador pode gerar link da PRÓPRIA designação
    or (designacao_id is not null and exists (
      select 1 from designacoes d
      where d.id = designacao_id and d.publicador_id = auth.uid()
    ))
  );

-- RPC pública: resolve o token e devolve o território como JSON.
-- security definer porque quadras/locais não têm leitura anon.
create or replace function territorio_publico(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  t record;
  resultado jsonb;
begin
  select * into t from territorio_tokens
    where token = p_token and (expira_em is null or expira_em > now());
  if not found then
    return null;
  end if;

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
        from quadras q where q.id = any(coalesce(a.quadras_ids, '{}'))
      ),
      'predios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', l.id, 'nome', l.nome, 'logradouro', l.logradouro,
          'numero', l.numero,
          'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb)), '[]'::jsonb)
        from locais l where l.id = any(coalesce(a.cartas_locais_ids, '{}'))
      ),
      'tce', (
        select jsonb_build_object('id', tc.id, 'nome', tc.nome,
          'poly_geojson', ST_AsGeoJSON(tc.poly)::jsonb)
        from tces tc where tc.id = a.tce_id
      )
    ) into resultado
    from arranjos a where a.id = t.arranjo_id;
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
        from designacao_quadras dq
        join quadras q on q.id = dq.quadra_id
        where dq.designacao_id = d.id
      ),
      'predios', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', l.id, 'nome', l.nome, 'logradouro', l.logradouro,
          'numero', l.numero,
          'geo_geojson', ST_AsGeoJSON(l.geo)::jsonb)), '[]'::jsonb)
        from designacao_locais dl
        join locais l on l.id = dl.local_id
        where dl.designacao_id = d.id
      )
    ) into resultado
    from designacoes d
    left join profiles p on p.id = d.publicador_id
    where d.id = t.designacao_id;
  end if;

  return resultado;
end;
$$;

revoke execute on function territorio_publico(uuid) from public;
grant execute on function territorio_publico(uuid) to anon, authenticated;
