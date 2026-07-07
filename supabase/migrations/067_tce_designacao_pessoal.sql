-- T25 (A21-f2): TCE fase 2 — TCE vira designável como território PESSOAL
-- (não só anexado a arranjo, feito na 066) e repartível dentro de um
-- arranjo, mesmo padrão de designacao_locais (migration 029).

create table if not exists designacao_tces (
  designacao_id bigint not null references designacoes(id) on delete cascade,
  tce_id text not null references tces(id) on delete cascade,
  primary key (designacao_id, tce_id)
);
create index if not exists designacao_tces_tce_idx on designacao_tces(tce_id);

alter table designacao_tces enable row level security;

drop policy if exists designacao_tces_publicador_read on designacao_tces;
create policy designacao_tces_publicador_read on designacao_tces
  for select to authenticated using (
    exists (
      select 1 from designacoes d
      where d.id = designacao_tces.designacao_id and d.publicador_id = auth.uid()
    )
  );

drop policy if exists designacao_tces_dirigente_all on designacao_tces;
create policy designacao_tces_dirigente_all on designacao_tces
  for all to authenticated
  using (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
  )
  with check (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
  );

-- Repartição do dirigente também alcança TCEs (mesmo padrão de
-- quadras_ids/locais_ids em arranjo_partes, migration 030).
alter table arranjo_partes add column if not exists tces_ids text[] not null default '{}';

-- Publicador passa a enxergar (select) um TCE também quando alcançado via
-- designação pessoal — além do publicador_id direto (migration 004).
-- Múltiplas policies "for select" no mesmo comando se combinam por OR,
-- então isso soma com tces_publicador_proprio sem substituí-la.
drop policy if exists tces_via_designacao on tces;
create policy tces_via_designacao on tces for select to authenticated
  using (
    exists (
      select 1 from designacao_tces dt
      join designacoes d on d.id = dt.designacao_id
      where dt.tce_id = tces.id and d.publicador_id = auth.uid() and d.status = 'aberta'
    )
  );

drop policy if exists tce_unidades_via_designacao on tce_unidades;
create policy tce_unidades_via_designacao on tce_unidades for select to authenticated
  using (
    exists (
      select 1 from designacao_tces dt
      join designacoes d on d.id = dt.designacao_id
      where dt.tce_id = tce_unidades.tce_id and d.publicador_id = auth.uid() and d.status = 'aberta'
    )
  );

-- Achado colateral (pesquisa T24): não havia NENHUMA policy de UPDATE
-- pro publicador dono de um TCE (só is_admin() por `tces_admin_all`) —
-- ou seja, o botão "Concluir" em /publicador/tce/[id] nunca funcionava
-- de fato pra um publicador comum (RLS silenciosamente não atualizava
-- nenhuma linha). Corrige aqui: publicador pode UPDATE o próprio TCE,
-- direto ou via designação pessoal ativa.
drop policy if exists tces_publicador_concluir on tces;
create policy tces_publicador_concluir on tces for update to authenticated
  using (
    publicador_id = auth.uid()
    or exists (
      select 1 from designacao_tces dt
      join designacoes d on d.id = dt.designacao_id
      where dt.tce_id = tces.id and d.publicador_id = auth.uid() and d.status = 'aberta'
    )
  )
  with check (
    publicador_id = auth.uid()
    or exists (
      select 1 from designacao_tces dt
      join designacoes d on d.id = dt.designacao_id
      where dt.tce_id = tces.id and d.publicador_id = auth.uid() and d.status = 'aberta'
    )
  );
