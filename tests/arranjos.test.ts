import { test, assertEq } from './harness';
import { ocorrenciasEntre, rangeDoPeriodo, rangeEscala, type ArranjoBase } from '../src/lib/arranjos';

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

// --- rangeEscala: janela navegável da escala imprimível (E-arranjos) ---

test('rangeEscala semana: segunda→domingo da semana da data base', () => {
  // 2026-08-05 é uma quarta-feira → semana 03/08 (seg) a 09/08 (dom)
  const r = rangeEscala('semana', 0, '2026-08-05');
  assertEq(r.isoIni, '2026-08-03');
  assertEq(r.isoFim, '2026-08-09');
});

test('rangeEscala semana: domingo pertence à semana que COMEÇOU na segunda', () => {
  // 2026-08-09 é domingo — não pode abrir uma semana nova
  const r = rangeEscala('semana', 0, '2026-08-09');
  assertEq(r.isoIni, '2026-08-03');
  assertEq(r.isoFim, '2026-08-09');
});

test('rangeEscala semana: offset anda 7 dias pra cada lado', () => {
  assertEq(rangeEscala('semana', -1, '2026-08-05').isoIni, '2026-07-27');
  assertEq(rangeEscala('semana', 1, '2026-08-05').isoIni, '2026-08-10');
});

test('rangeEscala mês: dia 1 ao último dia, com virada de ano no offset', () => {
  const ago = rangeEscala('mes', 0, '2026-08-05');
  assertEq(ago.isoIni, '2026-08-01');
  assertEq(ago.isoFim, '2026-08-31');
  assertEq(ago.label, 'Agosto de 2026');
  // fevereiro de 2028 é bissexto (29 dias) — e o offset atravessa o ano
  const fev = rangeEscala('mes', 6, '2027-08-15');
  assertEq(fev.isoIni, '2028-02-01');
  assertEq(fev.isoFim, '2028-02-29');
});

test('rangeEscala mês: offset negativo volta pro ano anterior', () => {
  const dez = rangeEscala('mes', -1, '2027-01-10');
  assertEq(dez.isoIni, '2026-12-01');
  assertEq(dez.isoFim, '2026-12-31');
  assertEq(dez.label, 'Dezembro de 2026');
});
