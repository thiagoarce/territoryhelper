// E2: ciclos do S-13 — a regra "abre na primeira designação, fecha quando
// a ÚLTIMA quadra do território é concluída" tem armadilhas de borda
// (evento dentro de ciclo aberto, conclusão antiga não conta, ciclo nunca
// fechado engole o resto) que só teste puro segura.
import { test, assertEq, assertTrue } from './harness';
import {
  ciclosDoTerritorio,
  periodoAnoDeServico,
  anoDeServicoDe,
  linhaDoAno,
  statusDoTerritorio,
  linhasImpressasS13,
  DESIGNADO_ARRANJO
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
    { inicio: '2025-02-15', designado: DESIGNADO_ARRANJO, conclusao: '2025-02-15', inferido: true },
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
    { inicio: '2025-05-01', designado: DESIGNADO_ARRANJO, conclusao: '2025-06-01' }
  ]);
});

test('ciclo NUNCA fechado (nenhuma quadra jamais concluída) engole eventos posteriores', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2'],
    [
      { data: '2025-01-10', nome: 'João' },
      { data: '2025-06-01', nome: 'Maria' }
    ],
    [] // nenhuma quadra concluída nunca — nem a margem de tolerância salva isso
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
    { inicio: '2025-01-20', designado: DESIGNADO_ARRANJO, conclusao: '2025-02-05', inferido: true }
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

test('mistura: com margem, a 2ª quadra refeita sozinha já fecha o ciclo (território de 2 quadras)', () => {
  // N=2 → margem=2: 1 quadra sem conclusão NOVA (Q2 só tem a conclusão já
  // consumida pelo ciclo anterior) ainda fecha o ciclo — Q1 sozinha basta.
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
    { inicio: '2025-06-10', designado: DESIGNADO_ARRANJO, conclusao: '2025-06-10', inferido: true }
  ]);
});

test('margem: território de 3 quadras fecha com 1 sem conclusão (dentro da margem mínima de 2)', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2', 'Q3'],
    [{ data: '2025-01-01', nome: 'João' }],
    [
      { quadra_id: 'Q1', data: '2025-01-10' },
      { quadra_id: 'Q2', data: '2025-01-15' }
      // Q3 nunca concluída — 1 falta, margem(3) = max(2, ceil(0.3)) = 2
    ]
  );
  assertEq(ciclos, [{ inicio: '2025-01-01', designado: 'João', conclusao: '2025-01-15' }]);
});

test('margem: território grande (30 quadras) fecha com exatamente 3 faltando (10%) mas não com 4', () => {
  const quadraIds = Array.from({ length: 30 }, (_, i) => `Q${i + 1}`);
  // margem(30) = max(2, ceil(3.0)) = 3
  const conclusoesCom3Faltando = quadraIds
    .slice(0, 27)
    .map((qid, i) => ({ quadra_id: qid, data: `2025-02-${String(i + 1).padStart(2, '0')}` }));
  const fechaCom3 = ciclosDoTerritorio(
    quadraIds,
    [{ data: '2025-01-01', nome: 'João' }],
    conclusoesCom3Faltando
  );
  assertEq(fechaCom3.length, 1);
  assertTrue(fechaCom3[0].conclusao !== null, 'deveria fechar tolerando 3 quadras faltando de 30');

  const conclusoesCom4Faltando = quadraIds
    .slice(0, 26)
    .map((qid, i) => ({ quadra_id: qid, data: `2025-02-${String(i + 1).padStart(2, '0')}` }));
  const abertoCom4 = ciclosDoTerritorio(
    quadraIds,
    [{ data: '2025-01-01', nome: 'João' }],
    conclusoesCom4Faltando
  );
  assertEq(abertoCom4.length, 1);
  assertEq(abertoCom4[0].conclusao, null);
});

test('margem NUNCA fecha com zero quadras concluídas, mesmo em território pequeno', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2'],
    [{ data: '2025-01-01', nome: 'João' }],
    [] // nenhuma conclusão — margem(2)=2 cobriria as 2 faltando, mas não fecha com ZERO feitas
  );
  assertEq(ciclos, [{ inicio: '2025-01-01', designado: 'João', conclusao: null }]);
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

test('statusDoTerritorio: sem ciclo nenhum e sem arranjo = pendente', () => {
  assertEq(statusDoTerritorio(['Q1'], [], [], false), 'pendente');
});

test('statusDoTerritorio: sem ciclo mas com arranjo ativo tocando = iniciado', () => {
  assertEq(statusDoTerritorio(['Q1'], [], [], true), 'iniciado');
});

test('statusDoTerritorio: último ciclo fechado = concluido', () => {
  const ciclos = [{ inicio: '2025-01-01', designado: 'Ana', conclusao: '2025-01-20' }];
  assertEq(statusDoTerritorio(['Q1'], ciclos, [{ quadra_id: 'Q1', data: '2025-01-20' }], false), 'concluido');
});

test('statusDoTerritorio: ciclo aberto sem nenhuma conclusão e sem arranjo = pendente', () => {
  const ciclos = [{ inicio: '2025-01-01', designado: 'Ana', conclusao: null }];
  assertEq(statusDoTerritorio(['Q1', 'Q2'], ciclos, [], false), 'pendente');
});

test('statusDoTerritorio: ciclo aberto com 1 quadra já concluída = iniciado', () => {
  const ciclos = [{ inicio: '2025-01-01', designado: 'Ana', conclusao: null }];
  const conclusoes = [{ quadra_id: 'Q1', data: '2025-01-15' }];
  assertEq(statusDoTerritorio(['Q1', 'Q2'], ciclos, conclusoes, false), 'iniciado');
});

test('statusDoTerritorio: ciclo aberto sem conclusão mas com arranjo ativo = iniciado', () => {
  const ciclos = [{ inicio: '2025-01-01', designado: 'Ana', conclusao: null }];
  assertEq(statusDoTerritorio(['Q1', 'Q2'], ciclos, [], true), 'iniciado');
});

test('statusDoTerritorio: conclusão ANTIGA (de antes deste ciclo abrir) não conta pra iniciado', () => {
  const ciclos = [{ inicio: '2025-03-01', designado: 'Ana', conclusao: null }];
  const conclusoes = [{ quadra_id: 'Q1', data: '2025-01-15' }]; // antes do inicio do ciclo
  assertEq(statusDoTerritorio(['Q1', 'Q2'], ciclos, conclusoes, false), 'pendente');
});

test('linhasImpressasS13: território com ≤4 ciclos cabe numa folha só', () => {
  const ciclos = [
    { inicio: '2025-09-01', designado: 'A', conclusao: '2025-09-05' },
    { inicio: '2025-09-10', designado: 'B', conclusao: '2025-09-15' }
  ];
  const linhas = linhasImpressasS13([{ id: '1', nome: null, ciclos }], 2026, 4);
  assertEq(linhas.length, 1);
  assertEq(linhas[0], { terr: '1', nome: null, ultima: null, ciclos, continuacao: false });
});

test('linhasImpressasS13: 9 ciclos viram 3 folhas, cada uma com sua Última data concluída preenchida', () => {
  const ciclos = [
    { inicio: '2025-09-01', designado: 'A', conclusao: '2025-09-05' },
    { inicio: '2025-09-10', designado: 'B', conclusao: '2025-09-15' },
    { inicio: '2025-09-20', designado: 'C', conclusao: '2025-09-25' },
    { inicio: '2025-10-01', designado: 'D', conclusao: '2025-10-05' }, // fim da folha 1
    { inicio: '2025-10-10', designado: 'E', conclusao: '2025-10-15' },
    { inicio: '2025-10-20', designado: 'F', conclusao: '2025-10-25' },
    { inicio: '2025-11-01', designado: 'G', conclusao: '2025-11-05' },
    { inicio: '2025-11-10', designado: 'H', conclusao: '2025-11-15' }, // fim da folha 2
    { inicio: '2025-11-20', designado: 'I', conclusao: '2025-11-25' } // folha 3 (só 1 ciclo)
  ];
  const linhas = linhasImpressasS13([{ id: '28', nome: 'Jardim Oceania', ciclos }], 2026, 4);
  assertEq(linhas.length, 3);
  // folha 1: sem histórico anterior no ano — "Última data concluída" fica
  // com o que já valia ANTES do ano (aqui, null — sem ciclo anterior).
  assertEq(linhas[0].continuacao, false);
  assertEq(linhas[0].ultima, null);
  assertEq(linhas[0].ciclos.length, 4);
  // folha 2 (continuação): "Última data concluída" = conclusão do
  // ÚLTIMO ciclo da folha 1 (não fica em branco).
  assertEq(linhas[1].continuacao, true);
  assertEq(linhas[1].ultima, '2025-10-05');
  assertEq(linhas[1].ciclos.length, 4);
  // folha 3: idem, carrega da folha 2.
  assertEq(linhas[2].continuacao, true);
  assertEq(linhas[2].ultima, '2025-11-15');
  assertEq(linhas[2].ciclos.length, 1);
});

test('linhasImpressasS13: território sem ciclo no ano ainda aparece (linha vazia)', () => {
  const linhas = linhasImpressasS13([{ id: '5', nome: null, ciclos: [] }], 2026, 4);
  assertEq(linhas, [{ terr: '5', nome: null, ultima: null, ciclos: [], continuacao: false }]);
});
