-- ============================================================================
-- 043_tp_escala_v2.sql — TP completo, incremento TP-C: escala designável +
-- equipamento por ocorrência.
--
-- Modelo de escala do usuário: o servo monta um arranjo-base DESIGNANDO
-- publicadores nos turnos (a partir das disponibilidades — TP-B); horários
-- e carrinhos que sobram ficam ABERTOS pra auto-inscrição pelo publicador.
-- Distinguimos os dois com tp_escala.origem.
--
-- Equipamento é recurso reservável por (turno, data): o turno tem um
-- carrinho padrão (tp_turnos.carrinho_id) e cada ocorrência pode ter
-- override + quem leva o carrinho (tp_turno_ocorrencias). A regra de
-- conflito (mesmo carrinho em dois turnos que se sobrepõem no mesmo dia)
-- é validada NA ACTION (não em constraint — precisa cruzar horários).
-- ============================================================================

alter table tp_escala add column if not exists origem text not null default 'inscricao'
  check (origem in ('inscricao','designacao'));
alter table tp_escala add column if not exists designado_por uuid references profiles(id) on delete set null;

-- Reescreve a policy de insert da 040: auto-inscrição só em nome próprio E
-- com origem='inscricao'; designação (origem='designacao', em nome de
-- outro) só admin. Mantém o exists(turno ativo) da 040.
drop policy if exists tp_escala_insert on tp_escala;
create policy tp_escala_insert on tp_escala for insert
  with check (
    (
      (publicador_id = auth.uid() and origem = 'inscricao')
      or is_admin()
    )
    and exists (select 1 from tp_turnos t where t.id = turno_id and t.ativo = true)
  );

-- Carrinho padrão do turno (recorrente).
alter table tp_turnos add column if not exists carrinho_id bigint references tp_carrinhos(id) on delete set null;

-- Metadados por ocorrência concreta (turno + data): override de carrinho e
-- quem transporta. PK composta = no máximo 1 linha por ocorrência.
create table if not exists tp_turno_ocorrencias (
  turno_id bigint not null references tp_turnos(id) on delete cascade,
  data date not null,
  carrinho_id bigint references tp_carrinhos(id) on delete set null,
  transportador_id uuid references profiles(id) on delete set null,
  notas text,
  atualizado_em timestamptz not null default now(),
  primary key (turno_id, data)
);

alter table tp_turno_ocorrencias enable row level security;

drop policy if exists tp_turno_ocorrencias_select on tp_turno_ocorrencias;
create policy tp_turno_ocorrencias_select on tp_turno_ocorrencias for select using (auth.uid() is not null);

-- Escrita: admin (define carrinho/transportador na montagem da escala) OU
-- o próprio publicador quando está se pondo como transportador ("Vou levar
-- o carrinho"). O publicador só pode deixar a linha com ele mesmo no
-- transportador_id — não pode escalar outra pessoa como transportador.
drop policy if exists tp_turno_ocorrencias_write on tp_turno_ocorrencias;
create policy tp_turno_ocorrencias_write on tp_turno_ocorrencias for all
  using (is_admin() or transportador_id = auth.uid())
  with check (is_admin() or transportador_id = auth.uid());
