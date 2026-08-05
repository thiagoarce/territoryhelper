// Conclusão por LADO da quadra (um lado = uma rua). O risco desta
// feature não é o caso feliz: é (a) a chave agrupar demais ou de menos,
// e (b) a quadra "fechar sozinha" na hora errada — ou continuar com os
// lados verdes depois de reaberta.
import { test, assertEq, assertTrue } from './harness';
import {
  chaveLado,
  ladosDaQuadra,
  ladoFeitoNoCiclo,
  ultimaConclusaoPorLado,
  todosLadosFeitos,
  dataConclusaoCheiaAutomatica
} from '$lib/lados';

const local = (id: number, logradouro: string, extra: any = {}) => ({ id, logradouro, ...extra });

test('chaveLado: abreviação e acento não criam lado novo', () => {
  assertEq(chaveLado('R. José de Alencar'), chaveLado('RUA JOSE DE ALENCAR'));
  assertEq(chaveLado('rua  josé   de alencar '), chaveLado('R José de Alencar'));
  assertEq(chaveLado('Av. Epitácio Pessoa'), chaveLado('AVENIDA EPITACIO PESSOA'));
});

test('chaveLado: TIPO diferente é lado diferente (Travessa João ≠ Rua João)', () => {
  assertTrue(chaveLado('Travessa João') !== chaveLado('Rua João'), 'travessa virou rua');
  assertEq(chaveLado('Tv. João'), chaveLado('TRAVESSA JOAO'));
});

test('chaveLado: ruas diferentes continuam diferentes; vazio não vira lado', () => {
  assertTrue(chaveLado('Rua A') !== chaveLado('Rua B'));
  assertEq(chaveLado(''), '');
  assertEq(chaveLado(null), '');
});

test('ladosDaQuadra: agrupa por rua e ignora endereço marcado como inexistente', () => {
  const locais = [
    local(1, 'R. Napoleão Abdon'),
    local(2, 'RUA NAPOLEAO ABDON'),
    local(3, 'Rua Edvaldo Brandão'),
    local(4, 'Rua Que Não Existe Mais', { marcado_nao_existe: true })
  ];
  const lados = ladosDaQuadra(locais, [], null);
  assertEq(lados.length, 2);
  const napoleao = lados.find((l) => l.rotulo.includes('Napoleão'))!;
  assertEq(napoleao.localIds.length, 2);
});

test('ladoFeitoNoCiclo: marca ANTERIOR à última conclusão cheia não conta', () => {
  const c = { lado_chave: 'RUA A', data_conclusao: '2026-01-10' };
  // quadra reaberta depois: o lado precisa ser refeito
  assertEq(ladoFeitoNoCiclo(c, '2026-02-01'), false);
  assertEq(ladoFeitoNoCiclo(c, '2026-01-05'), true);
  assertEq(ladoFeitoNoCiclo(c, null), true);
  assertEq(ladoFeitoNoCiclo(undefined, null), false);
  // marca no MESMO dia da conclusão cheia pertence ao ciclo que fechou
  assertEq(ladoFeitoNoCiclo(c, '2026-01-10'), false);
});

test('ultimaConclusaoPorLado: fica a maior data; empate resolve pelo marcado_em', () => {
  const m = ultimaConclusaoPorLado([
    { lado_chave: 'RUA A', data_conclusao: '2026-01-10', marcado_em: '2026-01-10T09:00:00Z' },
    { lado_chave: 'RUA A', data_conclusao: '2026-02-01', marcado_em: '2026-02-01T09:00:00Z' },
    { lado_chave: 'RUA B', data_conclusao: '2026-01-05', marcado_em: '2026-01-05T09:00:00Z' },
    { lado_chave: 'RUA B', data_conclusao: '2026-01-05', marcado_em: '2026-01-05T17:00:00Z' }
  ]);
  assertEq(m.get('RUA A')!.data_conclusao, '2026-02-01');
  assertEq(m.get('RUA B')!.marcado_em, '2026-01-05T17:00:00Z');
});

test('quadra de UMA rua só: marcar aquele lado já fecha tudo', () => {
  const locais = [local(1, 'Rua Única'), local(2, 'Rua Única')];
  const lados = ladosDaQuadra(locais, [{ lado_chave: chaveLado('Rua Única'), data_conclusao: '2026-03-01' }], null);
  assertEq(lados.length, 1);
  assertEq(todosLadosFeitos(lados), true);
  assertEq(dataConclusaoCheiaAutomatica(lados), '2026-03-01');
});

test('3 lados: com 2 marcados a quadra NÃO fecha; com o terceiro, fecha na maior data', () => {
  const locais = [local(1, 'Rua A'), local(2, 'Rua B'), local(3, 'Rua C')];
  const dois = ladosDaQuadra(
    locais,
    [
      { lado_chave: chaveLado('Rua A'), data_conclusao: '2026-03-01' },
      { lado_chave: chaveLado('Rua B'), data_conclusao: '2026-03-05' }
    ],
    null
  );
  assertEq(todosLadosFeitos(dois), false);
  assertEq(dois.filter((l) => l.feitoEm).length, 2);

  const tres = ladosDaQuadra(
    locais,
    [
      { lado_chave: chaveLado('Rua A'), data_conclusao: '2026-03-01' },
      { lado_chave: chaveLado('Rua B'), data_conclusao: '2026-03-05' },
      { lado_chave: chaveLado('Rua C'), data_conclusao: '2026-03-03' }
    ],
    null
  );
  assertEq(todosLadosFeitos(tres), true);
  assertEq(dataConclusaoCheiaAutomatica(tres), '2026-03-05');
});

test('quadra reaberta: lados do ciclo anterior aparecem em branco de novo', () => {
  const locais = [local(1, 'Rua A'), local(2, 'Rua B')];
  const conclusoes = [
    { lado_chave: chaveLado('Rua A'), data_conclusao: '2026-01-10' },
    { lado_chave: chaveLado('Rua B'), data_conclusao: '2026-01-12' }
  ];
  const lados = ladosDaQuadra(locais, conclusoes, '2026-01-12'); // quadra fechou nesse dia
  assertEq(lados.every((l) => l.feitoEm === null), true);
  assertEq(todosLadosFeitos(lados), false);
});

test('quadra SEM endereço não fecha sozinha (nada a concluir não é "tudo concluído")', () => {
  const lados = ladosDaQuadra([], [], null);
  assertEq(lados.length, 0);
  assertEq(todosLadosFeitos(lados), false);
  assertEq(dataConclusaoCheiaAutomatica(lados), null);
});
