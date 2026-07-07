-- T28 (A22-f3): reserva de sobra — publicador APROVADO (T31) pode criar
-- um agendamento pontual próprio (origem='reserva', já existente desde a
-- migration 058) numa célula vazia da grade, convidando outros
-- publicadores aprovados. `tp_agendamentos_admin` (migration 043) já
-- cobre o admin com "for all"; aqui só SOMAMOS as policies pro dono da
-- reserva (múltiplas policies do mesmo comando se combinam por OR).

drop policy if exists tp_agendamentos_reserva_insert on tp_agendamentos;
create policy tp_agendamentos_reserva_insert on tp_agendamentos for insert
  with check (
    origem = 'reserva' and criado_por = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.tp_aprovado)
  );

-- Dono da reserva pode cancelá-la (ativo=false) — mesmo padrão de
-- "arquivar" que o admin já usa pros próprios agendamentos.
drop policy if exists tp_agendamentos_reserva_update on tp_agendamentos;
create policy tp_agendamentos_reserva_update on tp_agendamentos for update
  using (origem = 'reserva' and criado_por = auth.uid())
  with check (origem = 'reserva' and criado_por = auth.uid());

-- Dono de uma reserva insere participantes nela (convida outros + si
-- mesmo) — soma com a policy existente (auto-inscrição em origem='inscricao').
drop policy if exists tp_agendamento_participantes_insert_reserva on tp_agendamento_participantes;
create policy tp_agendamento_participantes_insert_reserva on tp_agendamento_participantes for insert
  with check (
    exists (
      select 1 from tp_agendamentos a
      where a.id = tp_agendamento_participantes.agendamento_id
        and a.origem = 'reserva' and a.criado_por = auth.uid()
    )
  );
