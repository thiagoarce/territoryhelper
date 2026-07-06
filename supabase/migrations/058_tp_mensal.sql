-- 058 (T26/A22-f1): modelo do TP MENSAL em 3 fases.
--
-- Fluxo por mês (controlado pelo admin em /admin/tp):
--   1. 'disponibilidade' — publicador marca dias/horários do MÊS num
--      mini-calendário (tp_disponibilidade_mes; o padrão semanal
--      tp_disponibilidade vira só template de pré-preenchimento, e a
--      existência de linhas no mês JÁ É a confirmação — a tabela
--      tp_disponibilidade_confirmacoes fica órfã/sem uso).
--   2. 'montagem' — admin monta os turnos (manual no Planner; algoritmo
--      vem na T29).
--   3. 'publicado' — publicador vê a grade, ACEITA/RECUSA designação e
--      pode reservar sobras (T28).
--   4. 'fechado' — mês encerrado.
-- Idempotente: pode rodar mais de uma vez.

create table if not exists tp_meses (
  mes text primary key check (mes ~ '^\d{4}-\d{2}$'),
  fase text not null default 'disponibilidade'
    check (fase in ('disponibilidade','montagem','publicado','fechado')),
  atualizado_por uuid references profiles(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

alter table tp_meses enable row level security;
drop policy if exists "tp_meses_select" on tp_meses;
create policy "tp_meses_select" on tp_meses for select using (true);
drop policy if exists "tp_meses_write" on tp_meses;
create policy "tp_meses_write" on tp_meses
  for all using (is_admin()) with check (is_admin());

-- Disponibilidade POR MÊS/DIA (substitui o uso da semanal fixa)
create table if not exists tp_disponibilidade_mes (
  id bigserial primary key,
  publicador_id uuid not null references profiles(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  dia date not null,
  hora_inicio time not null,
  hora_fim time not null,
  criado_em timestamptz not null default now(),
  constraint tp_disp_mes_horas check (hora_fim > hora_inicio)
);

create index if not exists tp_disp_mes_idx on tp_disponibilidade_mes (mes, publicador_id);

alter table tp_disponibilidade_mes enable row level security;
drop policy if exists "tp_disp_mes_select" on tp_disponibilidade_mes;
create policy "tp_disp_mes_select" on tp_disponibilidade_mes
  for select using (publicador_id = auth.uid() or is_admin());
drop policy if exists "tp_disp_mes_write" on tp_disponibilidade_mes;
create policy "tp_disp_mes_write" on tp_disponibilidade_mes
  for all using (publicador_id = auth.uid())
  with check (publicador_id = auth.uid());

-- Designação agora tem resposta do publicador
alter table tp_agendamento_participantes
  add column if not exists status text not null default 'designado'
  check (status in ('designado','aceito','recusado'));

-- Publicador pode ATUALIZAR o próprio status (aceitar/recusar) — a
-- policy antiga cobria insert/delete próprios (inscrição); update do
-- próprio registro é novo.
drop policy if exists "tp_ag_part_update_self" on tp_agendamento_participantes;
create policy "tp_ag_part_update_self" on tp_agendamento_participantes
  for update using (publicador_id = auth.uid() or is_admin())
  with check (publicador_id = auth.uid() or is_admin());

-- Origem do agendamento: criado pelo admin (planner) ou RESERVA de sobra
-- feita por publicador (T28)
alter table tp_agendamentos
  add column if not exists origem text not null default 'admin'
  check (origem in ('admin','reserva'));
alter table tp_agendamentos
  add column if not exists criado_por uuid references profiles(id) on delete set null;
