import { test, assertEq } from './harness';
import { ocorrenciasEntre, ocorrenciasTurnoEntre, rangeDoPeriodo, type ArranjoBase, type TurnoBase } from '../src/lib/arranjos';

function arranjo(overrides: Partial<ArranjoBase>): ArranjoBase {
  return {
    id: 1,
    modalidade_id: 1,
    nome: null,
    recorrente: false,
    dia_semana: null,
    data: null,
    hora_inicio: null,
    hora_fim: null,
    local_endereco: null,
    dirigente_id: null,
    quadras_ids: null,
    cartas_locais_ids: null,
    arquivo_url: null,
    arquivo_nome: null,
    notas: null,
    ativo: true,
    data_inicio: null,
    data_fim: null,
    interessados: [],
    ...overrides
  };
}

test('arranjo pontual entra só se a data cair no range', () => {
  const a = arranjo({ id: 1, data: '2026-07-10' });
  const dentro = ocorrenciasEntre([a], '2026-07-01', '2026-07-31');
  const fora = ocorrenciasEntre([a], '2026-08-01', '2026-08-31');
  assertEq(dentro.length, 1);
  assertEq(fora.length, 0);
});

test('arranjo inativo nunca gera ocorrência', () => {
  const a = arranjo({ id: 1, data: '2026-07-10', ativo: false });
  assertEq(ocorrenciasEntre([a], '2026-07-01', '2026-07-31').length, 0);
});

test('arranjo recorrente gera 1 ocorrência por semana no dia certo', () => {
  // Julho/2026: dia 6 é segunda. dia_semana 1 = segunda.
  const a = arranjo({ id: 1, recorrente: true, dia_semana: 1, data_inicio: '2026-07-01', data_fim: '2026-07-31' });
  const ocs = ocorrenciasEntre([a], '2026-07-01', '2026-07-31');
  assertEq(ocs.length, 4); // 4 segundas em julho/2026 (6,13,20,27)
  assertEq(ocs.every((o) => o.dia_semana === 1), true);
});

test('arranjo recorrente respeita data_inicio/data_fim mesmo dentro do range pedido', () => {
  // Só a segunda 21/jul/2026 a 25/jul/2026 (nenhuma segunda nesse intervalo)
  const a = arranjo({ id: 1, recorrente: true, dia_semana: 1, data_inicio: '2026-07-21', data_fim: '2026-07-25' });
  const ocs = ocorrenciasEntre([a], '2026-07-01', '2026-07-31');
  assertEq(ocs.length, 0);
});

test('rangeDoPeriodo semana cobre 7 dias', () => {
  const r = rangeDoPeriodo('semana');
  const ini = new Date(r.isoIni + 'T12:00:00').getTime();
  const fim = new Date(r.isoFim + 'T12:00:00').getTime();
  assertEq(Math.round((fim - ini) / 86400000), 6);
});

function turno(overrides: Partial<TurnoBase>): TurnoBase {
  return { id: 1, ponto_id: 1, dia_semana: 1, hora_inicio: '08:00', hora_fim: '10:00', vagas: 2, ativo: true, ...overrides };
}

test('turno de TP expande semanalmente igual arranjo recorrente', () => {
  const t = turno({ dia_semana: 1 }); // segunda
  const ocs = ocorrenciasTurnoEntre([t], '2026-07-01', '2026-07-31');
  assertEq(ocs.length, 4);
});

test('turno inativo não gera ocorrência', () => {
  const t = turno({ ativo: false });
  assertEq(ocorrenciasTurnoEntre([t], '2026-07-01', '2026-07-31').length, 0);
});
