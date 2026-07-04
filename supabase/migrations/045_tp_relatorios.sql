-- ============================================================================
-- 045_tp_relatorios.sql — TP completo, incremento TP-D: relatório de fim de
-- turno. No fim do turno o publicador reporta o estado das peças (físicas +
-- literatura) do carrinho e as colocações. O que não estiver 'ok' vira a
-- fila de Reposição na área do servo.
-- ============================================================================

create table if not exists tp_relatorios (
  id bigserial primary key,
  turno_id bigint not null references tp_turnos(id) on delete cascade,
  data date not null,
  publicador_id uuid not null references profiles(id) on delete cascade,
  notas text,
  criado_em timestamptz not null default now(),
  unique (turno_id, data)             -- 1 relatório por ocorrência
);
create index if not exists tp_relatorios_data_idx on tp_relatorios(data);

create table if not exists tp_relatorio_itens (
  id bigserial primary key,
  relatorio_id bigint not null references tp_relatorios(id) on delete cascade,
  peca_id bigint not null references tp_pecas_catalogo(id) on delete cascade,
  estado text not null check (estado in ('ok','acabando','zerado','danificado')),
  qtd_colocada int,                   -- só literatura
  obs text,
  resolvido_em timestamptz,           -- servo marca reposto/consertado
  resolvido_por uuid references profiles(id) on delete set null
);
create index if not exists tp_relatorio_itens_relatorio_idx on tp_relatorio_itens(relatorio_id);
-- Fila de reposição = itens não-ok ainda não resolvidos.
create index if not exists tp_relatorio_itens_pendentes_idx on tp_relatorio_itens(resolvido_em)
  where resolvido_em is null;

alter table tp_relatorios enable row level security;
alter table tp_relatorio_itens enable row level security;

drop policy if exists tp_relatorios_select on tp_relatorios;
create policy tp_relatorios_select on tp_relatorios for select using (auth.uid() is not null);
-- A action valida que o publicador estava na escala da ocorrência; a RLS
-- garante que ninguém cria relatório em nome de outro.
drop policy if exists tp_relatorios_insert on tp_relatorios;
create policy tp_relatorios_insert on tp_relatorios for insert
  with check (publicador_id = auth.uid() or is_admin());
drop policy if exists tp_relatorios_update on tp_relatorios;
create policy tp_relatorios_update on tp_relatorios for update
  using (publicador_id = auth.uid() or is_admin())
  with check (publicador_id = auth.uid() or is_admin());

drop policy if exists tp_relatorio_itens_select on tp_relatorio_itens;
create policy tp_relatorio_itens_select on tp_relatorio_itens for select using (auth.uid() is not null);
-- Insert/delete de item: dono do relatório ou admin (via subquery no pai).
drop policy if exists tp_relatorio_itens_write on tp_relatorio_itens;
create policy tp_relatorio_itens_write on tp_relatorio_itens for all
  using (
    is_servo_pub() or exists (
      select 1 from tp_relatorios r
      where r.id = relatorio_id and (r.publicador_id = auth.uid() or is_admin())
    )
  )
  with check (
    is_servo_pub() or exists (
      select 1 from tp_relatorios r
      where r.id = relatorio_id and (r.publicador_id = auth.uid() or is_admin())
    )
  );
