-- ============================================================================
-- 042_tp_disponibilidade.sql — TP completo, incremento TP-B: disponibilidade
-- e transporte do publicador. Alimenta o "Designar" da escala (mostra só
-- quem pode no dia/hora do turno) e o aviso de "turno sem transportador".
-- Preferências e janelas ficam em tabela própria — NÃO se toca em profiles
-- (evita mexer nas policies/trigger de role).
-- ============================================================================

create table if not exists tp_preferencias (
  publicador_id uuid primary key references profiles(id) on delete cascade,
  transporta_carrinho boolean not null default false,
  notas text,
  atualizado_em timestamptz not null default now()
);

-- N janelas por publicador (ex: sábado 8-11, quarta 16-19).
create table if not exists tp_disponibilidade (
  id bigserial primary key,
  publicador_id uuid not null references profiles(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  check (hora_fim > hora_inicio)
);
create index if not exists tp_disponibilidade_pub_idx on tp_disponibilidade(publicador_id);

alter table tp_preferencias enable row level security;
alter table tp_disponibilidade enable row level security;

-- Select liberado pra qualquer autenticado: o servo/admin precisa enxergar
-- disponibilidade alheia pra escalar. Escrita só do próprio ou admin.
drop policy if exists tp_preferencias_select on tp_preferencias;
create policy tp_preferencias_select on tp_preferencias for select using (auth.uid() is not null);
drop policy if exists tp_preferencias_write on tp_preferencias;
create policy tp_preferencias_write on tp_preferencias for all
  using (publicador_id = auth.uid() or is_admin())
  with check (publicador_id = auth.uid() or is_admin());

drop policy if exists tp_disponibilidade_select on tp_disponibilidade;
create policy tp_disponibilidade_select on tp_disponibilidade for select using (auth.uid() is not null);
drop policy if exists tp_disponibilidade_write on tp_disponibilidade;
create policy tp_disponibilidade_write on tp_disponibilidade for all
  using (publicador_id = auth.uid() or is_admin())
  with check (publicador_id = auth.uid() or is_admin());
