// E2: ciclos do S-13 — a regra "abre na primeira designação, fecha quando
// a ÚLTIMA quadra do território é concluída" tem armadilhas de borda
// (evento dentro de ciclo aberto, conclusão antiga não conta, ciclo nunca
// fechado engole o resto) que só teste puro segura.
import { test, assertEq } from './harness';
import {
  ciclosDoTerritorio,
  periodoAnoDeServico,
  anoDeServicoDe,
  linhaDoAno,
  DESIGNADO_INFERIDO
} from '$lib/s13';

test('ciclo simples: designa, conclui as duas quadras, fecha na última', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2'],
    [{ data: '2025-01-10', nome: 'João' }],
    [
      { quadra_id: 'Q1', data: '2025-01-20' },
      { quadra_id: 'Q2', data: '2025-02-05' }
    ]
  );
  assertEq(ciclos, [{ inicio: '2025-01-10', designado: 'João', conclusao: '2025-02-05' }]);
});

test('conclusão ANTERIOR à designação não fecha o ciclo dela — mas vira ciclo inferido próprio', () => {
  // A conclusão de 02-15 não tem designação que a cubra (a única real é
  // depois, em 03-01): agora ela abre seu próprio ciclo inferido em vez
  // de sumir. O ciclo de Ana continua aberto (conclusao: null) — a
  // conclusão antiga não fecha ELE, exatamente como antes.
  const ciclos = ciclosDoTerritorio(
    ['Q1'],
    [{ data: '2025-03-01', nome: 'Ana' }],
    [{ quadra_id: 'Q1', data: '2025-02-15' }]
  );
  assertEq(ciclos, [
    { inicio: '2025-02-15', designado: DESIGNADO_INFERIDO, conclusao: '2025-02-15', inferido: true },
    { inicio: '2025-03-01', designado: 'Ana', conclusao: null }
  ]);
});

test('designação dentro de ciclo aberto pertence a ele (não abre outro)', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2'],
    [
      { data: '2025-01-10', nome: 'João' },
      { data: '2025-01-25', nome: 'Maria' } // Q2 ainda pendente — mesmo ciclo
    ],
    [
      { quadra_id: 'Q1', data: '2025-01-20' },
      { quadra_id: 'Q2', data: '2025-02-10' }
    ]
  );
  assertEq(ciclos.length, 1);
  assertEq(ciclos[0].designado, 'João');
  assertEq(ciclos[0].conclusao, '2025-02-10');
});

test('dois ciclos completos em sequência', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1'],
    [
      { data: '2025-01-10', nome: 'João' },
      { data: '2025-05-01', nome: null } // arranjo (grupo)
    ],
    [
      { quadra_id: 'Q1', data: '2025-02-01' },
      { quadra_id: 'Q1', data: '2025-06-01' }
    ]
  );
  assertEq(ciclos, [
    { inicio: '2025-01-10', designado: 'João', conclusao: '2025-02-01' },
    { inicio: '2025-05-01', designado: 'Campo (grupo)', conclusao: '2025-06-01' }
  ]);
});

test('ciclo aberto engole eventos posteriores', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2'],
    [
      { data: '2025-01-10', nome: 'João' },
      { data: '2025-06-01', nome: 'Maria' }
    ],
    [{ quadra_id: 'Q1', data: '2025-01-20' }] // Q2 nunca concluída
  );
  assertEq(ciclos.length, 1);
  assertEq(ciclos[0].conclusao, null);
});

test('conclusão sem NENHUMA designação registrada abre ciclo inferido (histórico/registro avulso)', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2'],
    [], // nenhum evento de designação
    [
      { quadra_id: 'Q1', data: '2025-01-20' },
      { quadra_id: 'Q2', data: '2025-02-05' }
    ]
  );
  assertEq(ciclos, [
    { inicio: '2025-01-20', designado: DESIGNADO_INFERIDO, conclusao: '2025-02-05', inferido: true }
  ]);
});

test('conclusão órfã DENTRO de um ciclo real não abre ciclo inferido duplicado', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2'],
    [{ data: '2025-01-01', nome: 'João' }],
    [
      { quadra_id: 'Q1', data: '2025-01-20' },
      { quadra_id: 'Q2', data: '2025-02-05' }
    ]
  );
  assertEq(ciclos, [{ inicio: '2025-01-01', designado: 'João', conclusao: '2025-02-05' }]);
});

test('mistura: território com um ciclo real fechado e uma quadra concluída depois sem designação nova', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2'],
    [{ data: '2025-01-01', nome: 'João' }],
    [
      { quadra_id: 'Q1', data: '2025-01-20' },
      { quadra_id: 'Q2', data: '2025-02-05' }, // fecha o ciclo real de João
      { quadra_id: 'Q1', data: '2025-06-10' } // Q1 refeita depois, sem designação nova registrada
    ]
  );
  assertEq(ciclos, [
    { inicio: '2025-01-01', designado: 'João', conclusao: '2025-02-05' },
    { inicio: '2025-06-10', designado: DESIGNADO_INFERIDO, conclusao: null, inferido: true }
  ]);
});

test('empate de data entre evento real e conclusão órfã: o real ganha o nome', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1'],
    [{ data: '2025-03-01', nome: 'Ana' }],
    [{ quadra_id: 'Q1', data: '2025-03-01' }]
  );
  assertEq(ciclos, [{ inicio: '2025-03-01', designado: 'Ana', conclusao: '2025-03-01' }]);
});

test('ano de serviço: setembro vira o ano seguinte', () => {
  assertEq(anoDeServicoDe('2024-09-01'), 2025);
  assertEq(anoDeServicoDe('2024-08-31'), 2024);
  assertEq(periodoAnoDeServico(2025), { inicio: '2024-09-01', fim: '2025-08-31' });
});

test('linhaDoAno: filtra ciclos ativos no ano e acha a última conclusão anterior', () => {
  const todos = [
    { inicio: '2023-10-01', designado: 'A', conclusao: '2024-03-01' }, // fechou antes do ano 2025
    { inicio: '2024-10-01', designado: 'B', conclusao: '2025-02-01' }, // dentro
    { inicio: '2025-07-01', designado: 'C', conclusao: null } // aberto no fim do ano
  ];
  const linha = linhaDoAno({ id: '7', nome: null }, todos, 2025);
  assertEq(linha.ultimaConclusaoAnterior, '2024-03-01');
  assertEq(linha.ciclos.length, 2);
  assertEq(linha.ciclos[0].designado, 'B');
  assertEq(linha.ciclos[1].designado, 'C');
});

test('ciclo que ATRAVESSA o ano (abriu antes, fechou dentro) aparece', () => {
  const todos = [{ inicio: '2024-05-01', designado: 'A', conclusao: '2024-10-15' }];
  const linha = linhaDoAno({ id: '1', nome: null }, todos, 2025);
  assertEq(linha.ciclos.length, 1);
  assertEq(linha.ultimaConclusaoAnterior, null);
});
