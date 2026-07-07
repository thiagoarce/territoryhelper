import { test, assertEq, assertTrue, assertFalse } from './harness';
import { montarMes, type TurnoAlvo, type JanelaDisponibilidade, type PublicadorMontagem, type ParticipanteExistente } from '../src/lib/tp-montagem';

function turno(overrides: Partial<TurnoAlvo>): TurnoAlvo {
  return {
    agendamento_id: 1,
    data: '2026-07-06',
    carrinho_id: 1,
    ponto_id: 1,
    ponto_avulso: null,
    hora_inicio: '09:00',
    hora_fim: '11:00',
    ...overrides
  };
}
function janela(overrides: Partial<JanelaDisponibilidade>): JanelaDisponibilidade {
  return { publicador_id: 'a', dia: '2026-07-06', hora_inicio: '08:00', hora_fim: '12:00', ...overrides };
}
function pub(id: string, transporta = false): PublicadorMontagem {
  return { id, transporta_carrinho: transporta };
}

test('turno solo: mira 2-3, preenche até o máximo com quem tem disponibilidade', () => {
  const t = turno({});
  const disp = ['a', 'b', 'c', 'd'].map((id) => janela({ publicador_id: id }));
  const pubs = ['a', 'b', 'c', 'd'].map((id) => pub(id));
  const { propostas, resumoPorTurno } = montarMes([t], disp, pubs, []);
  assertEq(propostas.length, 3, 'alvoMax de turno solo é 3');
  assertEq(resumoPorTurno[0].alvoMin, 2);
  assertEq(resumoPorTurno[0].designados, 3);
});

test('nunca designa fora da disponibilidade', () => {
  const t = turno({});
  const disp = [janela({ publicador_id: 'a', hora_inicio: '09:00', hora_fim: '10:00' })]; // não cobre até 11:00
  const pubs = [pub('a')];
  const { propostas } = montarMes([t], disp, pubs, []);
  assertEq(propostas.length, 0);
});

test('respeita disponibilidade parcial do dia (só uma janela cobre)', () => {
  const t = turno({});
  const disp = [
    janela({ publicador_id: 'a', hora_inicio: '06:00', hora_fim: '08:00' }), // não cobre
    janela({ publicador_id: 'a', hora_inicio: '09:00', hora_fim: '11:00' })  // cobre exatamente
  ];
  const pubs = [pub('a')];
  const { propostas } = montarMes([t], disp, pubs, []);
  assertEq(propostas.length, 1);
  assertEq(propostas[0].publicador_id, 'a');
});

test('balanceamento de carga: quem tem menos turnos no mês entra primeiro', () => {
  const t = turno({ agendamento_id: 2, data: '2026-07-07' });
  const disp = ['a', 'b'].map((id) => janela({ publicador_id: id, dia: '2026-07-07' }));
  const pubs = ['a', 'b'].map((id) => pub(id));
  // 'a' já tem 2 turnos no mês (outro agendamento), 'b' não tem nenhum.
  const jaDesignados: ParticipanteExistente[] = [
    { agendamento_id: 99, data: '2026-07-01', publicador_id: 'a' },
    { agendamento_id: 98, data: '2026-07-02', publicador_id: 'a' }
  ];
  const { propostas } = montarMes([t], disp, pubs, jaDesignados);
  assertEq(propostas[0].publicador_id, 'b', 'b tem menos carga, deveria entrar primeiro');
});

test('pelo menos 1 transporta_carrinho por turno quando disponível', () => {
  const t = turno({});
  const disp = ['a', 'b', 'c'].map((id) => janela({ publicador_id: id }));
  const pubs = [pub('a', false), pub('b', false), pub('c', true)];
  const { propostas } = montarMes([t], disp, pubs, []);
  assertTrue(propostas.some((p) => p.publicador_id === 'c' && p.motivo === 'transporte'));
});

test('sem transportador disponível: preenche mesmo assim (não trava)', () => {
  const t = turno({});
  const disp = ['a', 'b'].map((id) => janela({ publicador_id: id }));
  const pubs = [pub('a', false), pub('b', false)];
  const { propostas, resumoPorTurno } = montarMes([t], disp, pubs, []);
  assertEq(propostas.length, 2);
  assertFalse(resumoPorTurno[0].temTransporte);
});

test('dois carrinhos no mesmo ponto/horário formam grupo com alvo 3-5', () => {
  const t1 = turno({ agendamento_id: 1, carrinho_id: 1 });
  const t2 = turno({ agendamento_id: 2, carrinho_id: 2 }); // mesmo ponto/data/hora
  const disp = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => janela({ publicador_id: id }));
  const pubs = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => pub(id));
  const { resumoPorTurno } = montarMes([t1, t2], disp, pubs, []);
  for (const r of resumoPorTurno) assertEq(r.alvoMin, 3, 'turno em combinação mira mínimo 3');
});

test('não designa a mesma pessoa em dois turnos sobrepostos no mesmo dia', () => {
  const t1 = turno({ agendamento_id: 1, ponto_id: 1, hora_inicio: '09:00', hora_fim: '11:00' });
  const t2 = turno({ agendamento_id: 2, ponto_id: 2, hora_inicio: '10:00', hora_fim: '12:00' }); // sobrepõe 10-11
  const disp = [janela({ publicador_id: 'a', hora_inicio: '08:00', hora_fim: '13:00' })];
  const pubs = [pub('a')];
  const { propostas } = montarMes([t1, t2], disp, pubs, []);
  // 'a' só pode entrar em UM dos dois turnos sobrepostos.
  assertEq(propostas.length, 1);
});

test('não sobrepõe com designação já existente em outro turno', () => {
  const t1 = turno({ agendamento_id: 1, ponto_id: 1, hora_inicio: '09:00', hora_fim: '11:00' });
  const t2 = turno({ agendamento_id: 2, ponto_id: 2, hora_inicio: '10:00', hora_fim: '12:00' });
  const disp = [janela({ publicador_id: 'a', hora_inicio: '08:00', hora_fim: '13:00' })];
  const pubs = [pub('a')];
  // 'a' já está designado no turno 1 (existente) — não deve ser proposto pro turno 2 (sobrepõe).
  const jaDesignados: ParticipanteExistente[] = [{ agendamento_id: 1, data: t1.data, publicador_id: 'a' }];
  const { propostas } = montarMes([t1, t2], disp, pubs, jaDesignados);
  assertFalse(propostas.some((p) => p.agendamento_id === 2), 'não deveria propor a em t2, sobrepõe com t1 já designado');
});

test('turnos em horários não sobrepostos no mesmo dia podem ter a mesma pessoa', () => {
  const t1 = turno({ agendamento_id: 1, ponto_id: 1, hora_inicio: '08:00', hora_fim: '09:00' });
  const t2 = turno({ agendamento_id: 2, ponto_id: 2, hora_inicio: '10:00', hora_fim: '11:00' });
  const disp = [janela({ publicador_id: 'a', hora_inicio: '07:00', hora_fim: '13:00' })];
  const pubs = [pub('a')];
  const { propostas } = montarMes([t1, t2], disp, pubs, []);
  assertEq(propostas.filter((p) => p.publicador_id === 'a').length, 2);
});

test('não propõe ninguém quando não há candidatos elegíveis (turno some da lista, mas sem crash)', () => {
  const t = turno({});
  const { propostas, resumoPorTurno } = montarMes([t], [], [], []);
  assertEq(propostas.length, 0);
  assertEq(resumoPorTurno[0].designados, 0);
});
