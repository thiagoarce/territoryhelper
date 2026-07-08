// TP: montagem por match de disponibilidade (inverte tp-montagem.ts —
// gente com horário sobreposto sugere o turno, não o contrário).
import { test, assertEq } from './harness';
import { encontrarMatches } from '../src/lib/tp-matching';
import type { JanelaDisponibilidade, OcupacaoExistente } from '../src/lib/tp-matching';

function janela(publicador_id: string, dia: string, hora_inicio: string, hora_fim: string): JanelaDisponibilidade {
  return { publicador_id, dia, hora_inicio, hora_fim };
}

// 2026-07-07 é uma terça-feira (dia_semana 2).
const TERCA1 = '2026-07-07';
const TERCA2 = '2026-07-14';

test('par simples: 2 pessoas cobrindo o mesmo bloco de 2h', () => {
  const disp = [janela('a', TERCA1, '08:00', '10:00'), janela('b', TERCA1, '08:00', '10:00')];
  const props = encontrarMatches(disp);
  assertEq(props.length, 1);
  assertEq(props[0].recorrente, false);
  assertEq(props[0].hora_inicio, '08:00');
  assertEq(props[0].hora_fim, '10:00');
  assertEq(props[0].ocorrencias.length, 1);
  assertEq([...props[0].ocorrencias[0].publicadores].sort().join(','), 'a,b');
});

test('trio: 3 pessoas disponíveis no mesmo bloco viram 1 grupo de 3', () => {
  const disp = ['a', 'b', 'c'].map((p) => janela(p, TERCA1, '08:00', '10:00'));
  const props = encontrarMatches(disp);
  assertEq(props.length, 1);
  assertEq(props[0].ocorrencias[0].publicadores.length, 3);
});

test('4 pessoas: 2 pares em propostas separadas (locais separados)', () => {
  const disp = ['a', 'b', 'c', 'd'].map((p) => janela(p, TERCA1, '08:00', '10:00'));
  const props = encontrarMatches(disp);
  assertEq(props.length, 2);
  assertEq(props.every((p) => p.ocorrencias[0].publicadores.length === 2), true);
  const todos = new Set(props.flatMap((p) => p.ocorrencias[0].publicadores));
  assertEq(todos.size, 4); // ninguém repetido entre os 2 grupos
});

test('5 pessoas: 1 par + 1 trio (nunca um grupo de 1)', () => {
  const disp = ['a', 'b', 'c', 'd', 'e'].map((p) => janela(p, TERCA1, '08:00', '10:00'));
  const props = encontrarMatches(disp);
  const tamanhos = props.map((p) => p.ocorrencias[0].publicadores.length).sort();
  assertEq(tamanhos.join(','), '2,3');
});

test('janela longa vira vários blocos de 2h, não um turno gigante', () => {
  const disp = [janela('a', TERCA1, '08:00', '16:00'), janela('b', TERCA1, '08:00', '16:00')];
  const props = encontrarMatches(disp);
  // 08-10, 10-12, 12-14, 14-16 => 4 blocos de 2h
  assertEq(props.length, 4);
  assertEq(props.every((p) => p.ocorrencias[0].publicadores.length === 2), true);
});

test('recorrência: mesmo par no mesmo horário em 2 semanas', () => {
  const disp = [
    janela('a', TERCA1, '08:00', '10:00'), janela('b', TERCA1, '08:00', '10:00'),
    janela('a', TERCA2, '08:00', '10:00'), janela('b', TERCA2, '08:00', '10:00')
  ];
  const props = encontrarMatches(disp);
  assertEq(props.length, 1);
  assertEq(props[0].recorrente, true);
  assertEq(props[0].ocorrencias.length, 2);
  assertEq(props[0].ocorrencias.map((o) => o.data).join(','), `${TERCA1},${TERCA2}`);
});

test('recorrência com composição variável: 3ª pessoa some numa semana', () => {
  const disp = [
    janela('a', TERCA1, '08:00', '10:00'), janela('b', TERCA1, '08:00', '10:00'), janela('c', TERCA1, '08:00', '10:00'),
    janela('a', TERCA2, '08:00', '10:00'), janela('b', TERCA2, '08:00', '10:00')
  ];
  const props = encontrarMatches(disp);
  assertEq(props.length, 1); // mesmo slot, 1 proposta recorrente
  assertEq(props[0].recorrente, true);
  assertEq(props[0].ocorrencias[0].publicadores.length, 3); // trio na 1ª semana
  assertEq(props[0].ocorrencias[1].publicadores.length, 2); // par na 2ª (c sumiu)
});

test('ocupação existente exclui quem já está escalado nesse horário', () => {
  const disp = [janela('a', TERCA1, '08:00', '10:00'), janela('b', TERCA1, '08:00', '10:00')];
  const ocupados: OcupacaoExistente[] = [{ publicador_id: 'b', data: TERCA1, hora_inicio: '08:00', hora_fim: '10:00' }];
  const props = encontrarMatches(disp, ocupados);
  assertEq(props.length, 0); // só sobra 'a' — sem par, sem proposta
});

test('sem disponibilidade nenhuma: lista vazia', () => {
  assertEq(encontrarMatches([]).length, 0);
});

test('1 pessoa só: nunca propõe grupo de 1', () => {
  const disp = [janela('a', TERCA1, '08:00', '10:00')];
  assertEq(encontrarMatches(disp).length, 0);
});
