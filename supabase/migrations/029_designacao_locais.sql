-- ============================================================================
-- 029_designacao_locais.sql — Designação de prédio como território pessoal
-- (tipo='cartas'). Dirigente/admin designa prédios avulsos a um publicador
-- pra fazer trabalho de cartas. Análogo a designacao_quadras.
-- ============================================================================

-- Estende check de designacoes.tipo pra incluir 'cartas'
do $$
begin
  alter table designacoes drop constraint if exists designacoes_tipo_check;
  alter table designacoes add constraint designacoes_tipo_check
    check (tipo in ('pessoal', 'arranjo', 'cartas'));
exception when others then null;
end $$;

-- Nova junção N:N designacao ↔ local (pra cartas)
create table if not exists designacao_locais (
  designacao_id bigint not null references designacoes(id) on delete cascade,
  local_id bigint not null references locais(id) on delete cascade,
  primary key (designacao_id, local_id)
);

create index if not exists designacao_locais_local_idx on designacao_locais(local_id);

alter table designacao_locais enable row level security;

-- RLS: publicador vê os próprios (via join com designacoes)
drop policy if exists designacao_locais_publicador_read on designacao_locais;
create policy designacao_locais_publicador_read on designacao_locais
  for select to authenticated using (
    exists (
      select 1 from designacoes d
      where d.id = designacao_locais.designacao_id and d.publicador_id = auth.uid()
    )
  );

-- Admin e dirigente veem tudo + escrevem
drop policy if exists designacao_locais_dirigente_all on designacao_locais;
create policy designacao_locais_dirigente_all on designacao_locais
  for all to authenticated
  using (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
  )
  with check (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
  );

-- Estende pode_editar_local pra incluir designações de cartas
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
      select 1
      from locais l
      join designacao_quadras dq on dq.quadra_id = l.quadra_id
      join designacoes d on d.id = dq.designacao_id
      where l.id = p_local_id
        and d.publicador_id = auth.uid()
        and d.status = 'aberta'
    )
    or exists (
      -- Designação de cartas do próprio publicador
      select 1
      from designacao_locais dl
      join designacoes d on d.id = dl.designacao_id
      where dl.local_id = p_local_id
        and d.publicador_id = auth.uid()
        and d.status = 'aberta'
    )
    or exists (
      -- Delegação temp
      select 1
      from locais l
      join delegacoes_temp t on t.publicador_id = auth.uid()
      where l.id = p_local_id
        and l.quadra_id = any(t.quadras_ids)
        and t.data_fim > now()
    )
    or exists (
      select 1
      from arranjos a
      where a.ativo = true
        and a.cartas_locais_ids @> array[p_local_id]
        and (a.dirigente_id = auth.uid() or a.dirigente_id is null)
    );
$$;
