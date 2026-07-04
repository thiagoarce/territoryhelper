-- ============================================================================
-- 043_tp_agendamentos.sql — TP completo, incremento TP-F: pivô do modelo de
-- escala. SUBSTITUI a antiga `043_tp_escala_v2.sql` (nunca aplicada em
-- produção — TP-C nunca foi construído, só ficou especificado) e as
-- tabelas `tp_turnos`/`tp_escala` (migration 036, JÁ SHIPADO e em uso,
-- mas confirmado sem dado real cadastrado hoje).
--
-- Motivo do pivô (decisão do usuário, não é ajuste fino):
--   - O CARRINHO é o calendário — não o ponto. Cada carrinho tem sua
--     própria agenda; existe uma "visão geral" com todos os carrinhos
--     sobrepostos, coloridos por equipamento (daí `tp_carrinhos.cor`).
--   - Ponto pode ser fixo (catálogo, tp_pontos) OU avulso (texto livre
--     digitado na hora, pra caso pontual fora do cadastro).
--   - SEM capacidade fixa ("vagas") — N publicadores por agendamento,
--     sem teto. `tp_turnos.vagas` e a validação de count>=vagas morrem
--     junto com a tabela.
--   - Recorrência tipo Google Calendar: nenhuma / diária / semanal /
--     quinzenal / mensal (mesmo dia do mês), com fim opcional. Editar ou
--     excluir uma ocorrência específica não mexe na série inteira
--     (tabela de exceções, como calendários de verdade fazem).
--   - Conflito de equipamento continua bloqueando: mesmo carrinho não
--     pode estar em dois lugares com horário sobreposto no mesmo dia —
--     mas isso é validado NA ACTION (precisa expandir recorrência +
--     aplicar exceções pra saber a ocorrência real do dia), não dá pra
--     expressar como constraint de banco.
-- ============================================================================

drop table if exists tp_turno_ocorrencias;   -- da 043 antiga, pode nunca ter existido
drop table if exists tp_escala;
drop table if exists tp_turnos;

-- Carrinho ganha cor pra "visão geral" (todos os carrinhos sobrepostos,
-- cada um com sua cor) fazer sentido visualmente.
alter table tp_carrinhos add column if not exists cor text not null default '#3b82f6';

-- Agendamento = carrinho + ponto (fixo OU avulso) + data/hora + recorrência.
-- `data` é a PRIMEIRA ocorrência (ou a única, se recorrencia='nenhuma').
create table tp_agendamentos (
  id bigserial primary key,
  carrinho_id bigint not null references tp_carrinhos(id) on delete restrict,
  ponto_id bigint references tp_pontos(id) on delete restrict,
  ponto_avulso text,                  -- texto livre, usado quando ponto_id é null
  data date not null,
  hora_inicio time not null,
  hora_fim time not null,
  recorrencia text not null default 'nenhuma'
    check (recorrencia in ('nenhuma','diaria','semanal','quinzenal','mensal')),
  recorrencia_fim date,               -- null = recorrência sem fim definido
  ativo boolean not null default true,  -- soft-delete da série inteira
  notas text,
  criado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now(),
  check (num_nonnulls(ponto_id, ponto_avulso) = 1),
  check (hora_fim > hora_inicio),
  check (recorrencia_fim is null or recorrencia_fim >= data)
);
create index tp_agendamentos_carrinho_idx on tp_agendamentos(carrinho_id);
create index tp_agendamentos_data_idx on tp_agendamentos(data);

-- Exceção de uma ocorrência específica da série: cancelada (sumiu só esse
-- dia) OU com campos sobrescritos (editou só esta ocorrência). Os campos
-- de override ficam null quando não sobrescritos — a action aplica
-- coalesce contra o agendamento base na hora de expandir.
create table tp_agendamento_excecoes (
  id bigserial primary key,
  agendamento_id bigint not null references tp_agendamentos(id) on delete cascade,
  data date not null,
  cancelada boolean not null default false,
  hora_inicio time,
  hora_fim time,
  carrinho_id bigint references tp_carrinhos(id) on delete set null,
  ponto_id bigint references tp_pontos(id) on delete set null,
  ponto_avulso text,
  notas text,
  unique (agendamento_id, data)
);
create index tp_agendamento_excecoes_agendamento_idx on tp_agendamento_excecoes(agendamento_id);

-- Participantes de uma ocorrência concreta (agendamento + data). SEM vagas/
-- capacidade — quantos entrarem, entram. `origem` distingue quem se
-- auto-inscreveu (horário livre) de quem foi designado pelo admin.
create table tp_agendamento_participantes (
  id bigserial primary key,
  agendamento_id bigint not null references tp_agendamentos(id) on delete cascade,
  data date not null,
  publicador_id uuid not null references profiles(id) on delete cascade,
  origem text not null default 'inscricao' check (origem in ('inscricao','designacao')),
  designado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (agendamento_id, data, publicador_id)
);
create index tp_agendamento_participantes_agendamento_idx on tp_agendamento_participantes(agendamento_id, data);
create index tp_agendamento_participantes_publicador_idx on tp_agendamento_participantes(publicador_id);

alter table tp_agendamentos enable row level security;
alter table tp_agendamento_excecoes enable row level security;
alter table tp_agendamento_participantes enable row level security;

-- Agendamentos e exceções: quem monta a agenda é o admin ("eu faço as
-- designações no início do mês"). Leitura liberada pra todo autenticado
-- (o publicador precisa ver os horários livres pra se candidatar).
create policy tp_agendamentos_select on tp_agendamentos for select using (auth.uid() is not null);
create policy tp_agendamentos_admin on tp_agendamentos for all using (is_admin()) with check (is_admin());

create policy tp_agendamento_excecoes_select on tp_agendamento_excecoes for select using (auth.uid() is not null);
create policy tp_agendamento_excecoes_admin on tp_agendamento_excecoes for all using (is_admin()) with check (is_admin());

-- Participantes: publicador entra/sai de um horário livre por conta
-- própria (origem='inscricao', só em nome dele mesmo); designação
-- (origem='designacao', em nome de outro) só admin.
create policy tp_agendamento_participantes_select on tp_agendamento_participantes for select using (auth.uid() is not null);
create policy tp_agendamento_participantes_insert on tp_agendamento_participantes for insert
  with check (
    (publicador_id = auth.uid() and origem = 'inscricao') or is_admin()
  );
create policy tp_agendamento_participantes_delete on tp_agendamento_participantes for delete
  using (publicador_id = auth.uid() or is_admin());
