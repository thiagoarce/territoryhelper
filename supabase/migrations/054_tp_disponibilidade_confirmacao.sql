-- ============================================================================
-- 054_tp_disponibilidade_confirmacao.sql — TP-B revisão: o Planner de TP é
-- MENSAL, então a disponibilidade fixa (tp_disponibilidade, dia_semana +
-- horário) precisa ser CONFIRMADA a cada novo mês — evita o admin montar a
-- escala de julho em cima de uma disponibilidade que já mudou desde março.
-- 1 linha por (publicador, mês); confirmar de novo no mesmo mês só
-- atualiza confirmado_em (idempotente via upsert).
-- ============================================================================

create table if not exists tp_disponibilidade_confirmacoes (
  id bigserial primary key,
  publicador_id uuid not null references profiles(id) on delete cascade,
  mes_referencia text not null check (mes_referencia ~ '^\d{4}-\d{2}$'),
  confirmado_em timestamptz not null default now(),
  unique(publicador_id, mes_referencia)
);

alter table tp_disponibilidade_confirmacoes enable row level security;

drop policy if exists tp_disponibilidade_confirmacoes_select on tp_disponibilidade_confirmacoes;
create policy tp_disponibilidade_confirmacoes_select on tp_disponibilidade_confirmacoes for select
  using (publicador_id = auth.uid() or is_admin());

drop policy if exists tp_disponibilidade_confirmacoes_write on tp_disponibilidade_confirmacoes;
create policy tp_disponibilidade_confirmacoes_write on tp_disponibilidade_confirmacoes for all
  using (publicador_id = auth.uid()) with check (publicador_id = auth.uid());
