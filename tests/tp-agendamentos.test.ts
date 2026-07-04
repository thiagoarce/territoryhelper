import { test, assertEq, assertTrue } from './harness';
import {
  ocorrenciasAgendamentoEntre,
  ocorrenciaConflitante,
  type AgendamentoBase,
  type ExcecaoBase
} from '../src/lib/tp-agendamentos';

function agendamento(overrides: Partial<AgendamentoBase>): AgendamentoBase {
  return {
    id: 1,
    carrinho_id: 1,
    ponto_id: 1,
    ponto_avulso: null,
    data: '2026-07-06', // segunda
    hora_inicio: '08:00',
    hora_fim: '10:00',
    recorrencia: 'nenhuma',
    recorrencia_fim: null,
    ativo: true,
    notas: null,
    ...overrides
  };
}

test('recorrencia nenhuma: só a data única', () => {
  const a = agendamento({ data: '2026-07-10' });
  assertEq(ocorrenciasAgendamentoEntre([a], [], '2026-07-01', '2026-07-31').length, 1);
  assertEq(ocorrenciasAgendamentoEntre([a], [], '2026-08-01', '2026-08-31').length, 0);
});

test('agendamento inativo nunca gera ocorrência', () => {
  const a = agendamento({ data: '2026-07-10', ativo: false });
  assertEq(ocorrenciasAgendamentoEntre([a], [], '2026-07-01', '2026-07-31').length, 0);
});

test('recorrencia diaria gera 1 por dia até recorrencia_fim', () => {
  const a = agendamento({ recorrencia: 'diaria', data: '2026-07-01', recorrencia_fim: '2026-07-05' });
  const ocs = ocorrenciasAgendamentoEntre([a], [], '2026-07-01', '2026-07-31');
  assertEq(ocs.length, 5);
});

test('recorrencia semanal gera 1 por semana no mesmo dia', () => {
  // julho/2026: segundas em 6,13,20,27
  const a = agendamento({ recorrencia: 'semanal', data: '2026-07-06' });
  const ocs = ocorrenciasAgendamentoEntre([a], [], '2026-07-01', '2026-07-31');
  assertEq(ocs.length, 4);
});

test('recorrencia quinzenal pula uma semana', () => {
  const a = agendamento({ recorrencia: 'quinzenal', data: '2026-07-06' });
  const ocs = ocorrenciasAgendamentoEntre([a], [], '2026-07-01', '2026-07-31');
  assertEq(ocs.map((o) => o.data), ['2026-07-06', '2026-07-20']);
});

test('recorrencia mensal gera no mesmo dia do mês', () => {
  const a = agendamento({ recorrencia: 'mensal', data: '2026-01-15' });
  const ocs = ocorrenciasAgendamentoEntre([a], [], '2026-01-01', '2026-06-30');
  assertEq(ocs.map((o) => o.data), ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15']);
});

test('recorrencia mensal no dia 31 pula meses sem esse dia', () => {
  const a = agendamento({ recorrencia: 'mensal', data: '2026-01-31' });
  const ocs = ocorrenciasAgendamentoEntre([a], [], '2026-01-01', '2026-04-30');
  // Fev/2026 (28 dias) e abril (30 dias) não têm dia 31 — só jan e março.
  assertEq(ocs.map((o) => o.data), ['2026-01-31', '2026-03-31']);
});

test('recorrencia respeita recorrencia_fim', () => {
  const a = agendamento({ recorrencia: 'semanal', data: '2026-07-06', recorrencia_fim: '2026-07-13' });
  const ocs = ocorrenciasAgendamentoEntre([a], [], '2026-07-01', '2026-07-31');
  assertEq(ocs.map((o) => o.data), ['2026-07-06', '2026-07-13']);
});

test('excecao cancelada remove só aquela ocorrência', () => {
  const a = agendamento({ recorrencia: 'semanal', data: '2026-07-06' });
  const exc: ExcecaoBase = {
    agendamento_id: 1, data: '2026-07-13', cancelada: true,
    hora_inicio: null, hora_fim: null, carrinho_id: null, ponto_id: null, ponto_avulso: null, notas: null
  };
  const ocs = ocorrenciasAgendamentoEntre([a], [exc], '2026-07-01', '2026-07-31');
  assertEq(ocs.map((o) => o.data), ['2026-07-06', '2026-07-20', '2026-07-27']);
});

test('excecao sobrescreve horário só de uma ocorrência', () => {
  const a = agendamento({ recorrencia: 'semanal', data: '2026-07-06', hora_inicio: '08:00', hora_fim: '10:00' });
  const exc: ExcecaoBase = {
    agendamento_id: 1, data: '2026-07-13', cancelada: false,
    hora_inicio: '14:00', hora_fim: '16:00', carrinho_id: null, ponto_id: null, ponto_avulso: null, notas: null
  };
  const ocs = ocorrenciasAgendamentoEntre([a], [exc], '2026-07-06', '2026-07-13');
  const alterada = ocs.find((o) => o.data === '2026-07-13')!;
  const normal = ocs.find((o) => o.data === '2026-07-06')!;
  assertEq(alterada.hora_inicio, '14:00');
  assertEq(normal.hora_inicio, '08:00');
});

test('excecao sobrescreve ponto avulso só de uma ocorrência', () => {
  const a = agendamento({ recorrencia: 'semanal', data: '2026-07-06', ponto_id: 5, ponto_avulso: null });
  const exc: ExcecaoBase = {
    agendamento_id: 1, data: '2026-07-13', cancelada: false,
    hora_inicio: null, hora_fim: null, carrinho_id: null, ponto_id: null, ponto_avulso: 'Feira livre (avulso)', notas: null
  };
  const ocs = ocorrenciasAgendamentoEntre([a], [exc], '2026-07-06', '2026-07-13');
  const alterada = ocs.find((o) => o.data === '2026-07-13')!;
  const normal = ocs.find((o) => o.data === '2026-07-06')!;
  assertEq(alterada.ponto_id, null);
  assertEq(alterada.ponto_avulso, 'Feira livre (avulso)');
  assertEq(normal.ponto_id, 5);
});

test('conflito: mesmo carrinho em horário sobreposto no mesmo dia é detectado', () => {
  const a1 = agendamento({ id: 1, carrinho_id: 1, data: '2026-07-06', hora_inicio: '08:00', hora_fim: '10:00', recorrencia: 'nenhuma' });
  const conflito = ocorrenciaConflitante([a1], [], 1, '2026-07-06', '09:00', '11:00');
  assertTrue(conflito !== null);
  assertEq(conflito!.agendamento_id, 1);
});

test('conflito: horários adjacentes (sem sobreposição) não conflitam', () => {
  const a1 = agendamento({ id: 1, carrinho_id: 1, data: '2026-07-06', hora_inicio: '08:00', hora_fim: '10:00', recorrencia: 'nenhuma' });
  const conflito = ocorrenciaConflitante([a1], [], 1, '2026-07-06', '10:00', '12:00');
  assertEq(conflito, null);
});

test('conflito: carrinhos diferentes no mesmo horário não conflitam', () => {
  const a1 = agendamento({ id: 1, carrinho_id: 1, data: '2026-07-06', hora_inicio: '08:00', hora_fim: '10:00', recorrencia: 'nenhuma' });
  const conflito = ocorrenciaConflitante([a1], [], 2, '2026-07-06', '08:00', '10:00');
  assertEq(conflito, null);
});

test('conflito: ignora o próprio agendamento sendo editado', () => {
  const a1 = agendamento({ id: 1, carrinho_id: 1, data: '2026-07-06', hora_inicio: '08:00', hora_fim: '10:00', recorrencia: 'nenhuma' });
  const conflito = ocorrenciaConflitante([a1], [], 1, '2026-07-06', '08:00', '10:00', 1);
  assertEq(conflito, null);
});

test('conflito: cruza recorrências diferentes no mesmo dia', () => {
  // Um agendamento semanal e outro pontual, mesmo carrinho, mesmo dia, horário sobreposto.
  const a1 = agendamento({ id: 1, carrinho_id: 1, recorrencia: 'semanal', data: '2026-07-06', hora_inicio: '08:00', hora_fim: '10:00' });
  const a2 = agendamento({ id: 2, carrinho_id: 1, recorrencia: 'nenhuma', data: '2026-07-20', hora_inicio: '09:00', hora_fim: '11:00' });
  const conflito = ocorrenciaConflitante([a1, a2], [], 1, '2026-07-20', '09:30', '10:30', 2);
  assertTrue(conflito !== null);
  assertEq(conflito!.agendamento_id, 1);
});
