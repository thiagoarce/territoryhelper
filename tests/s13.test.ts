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
  folhasImpressasS13,
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

test('ciclo NUNCA fechado (nenhuma quadra jamais concluída) sem redesignação real depois fica aberto', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2'],
    [{ data: '2025-01-10', nome: 'João' }],
    [] // nenhuma quadra concluída nunca — nem a margem de tolerância salva isso
  );
  assertEq(ciclos.length, 1);
  assertEq(ciclos[0].conclusao, null);
});

test('ciclo NUNCA fechado, mas com REDESIGNAÇÃO real depois: força fechamento (sem data) e abre o novo', () => {
  // Diferente do teste acima: aqui há um 2º evento REAL (Maria) — a regra
  // do usuário vale mesmo sem NENHUMA conclusão registrada no ciclo
  // travado (não esconde a redesignação real por falta de dado).
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2'],
    [
      { data: '2025-01-10', nome: 'João' },
      { data: '2025-06-01', nome: 'Maria' }
    ],
    []
  );
  assertEq(ciclos, [
    { inicio: '2025-01-10', designado: 'João', conclusao: null, fechamentoForcado: true },
    { inicio: '2025-06-01', designado: 'Maria', conclusao: null }
  ]);
});

test('ciclo travado além da margem: redesignação REAL depois força fechamento e abre ciclo novo', () => {
  // Território-3/Paulo-Bonan: ciclo de João travou (faltam quadras além
  // da margem), mas uma designação REAL posterior (arranjo de Paulo)
  // prova que o território seguiu adiante — fecha o de João na melhor
  // data disponível e abre o de Paulo, em vez de engolir o evento.
  // 5 quadras, margem=2: só Q1 concluída, 4 faltando > margem — não fecha normal.
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
    [
      { data: '2025-01-01', nome: 'João' },
      { data: '2025-06-01', nome: 'Paulo' }
    ],
    [{ quadra_id: 'Q1', data: '2025-01-10' }]
  );
  assertEq(ciclos, [
    { inicio: '2025-01-01', designado: 'João', conclusao: '2025-01-10', fechamentoForcado: true },
    { inicio: '2025-06-01', designado: 'Paulo', conclusao: null }
  ]);
});

test('ciclo travado sem NENHUMA conclusão: redesignação real ainda força, com conclusao null', () => {
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2', 'Q3'],
    [
      { data: '2025-01-01', nome: 'João' },
      { data: '2025-06-01', nome: 'Paulo' }
    ],
    [] // nenhuma quadra concluída no ciclo de João
  );
  assertEq(ciclos, [
    { inicio: '2025-01-01', designado: 'João', conclusao: null, fechamentoForcado: true },
    { inicio: '2025-06-01', designado: 'Paulo', conclusao: null }
  ]);
});

test('fechamento forçado NÃO engole o trabalho da própria redesignação (teto na data dela)', () => {
  // Regressão: a busca forçada era SEM teto no ramo real — pegava as
  // conclusões que a equipe NOVA fez (jun), o fim caía dentro do ciclo
  // novo e o evento do Paulo era pulado (sumia do S-13). Com o teto, o
  // ciclo do João fecha na melhor conclusão ANTES da redesignação e o
  // do Paulo abre normalmente.
  const ciclos = ciclosDoTerritorio(
    ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10'],
    [
      { data: '2025-01-01', nome: 'João' },
      { data: '2025-06-01', nome: 'Paulo' }
    ],
    [
      { quadra_id: 'Q1', data: '2025-01-10' },
      { quadra_id: 'Q2', data: '2025-01-15' },
      { quadra_id: 'Q3', data: '2025-01-20' },
      // trabalho da redesignação (Paulo) — não pode fechar o ciclo do João
      { quadra_id: 'Q4', data: '2025-06-10' },
      { quadra_id: 'Q5', data: '2025-06-12' }
    ]
  );
  assertEq(ciclos, [
    { inicio: '2025-01-01', designado: 'João', conclusao: '2025-01-20', fechamentoForcado: true },
    { inicio: '2025-06-01', designado: 'Paulo', conclusao: null }
  ]);
});

test('linhaDoAno: ciclo forçado SEM conclusão não reaparece nos anos seguintes', () => {
  // Regressão: conclusao null passava no filtro de "ainda aberto" pra
  // sempre — o ciclo fechado à força sem data reaparecia em toda folha
  // futura. O fim efetivo dele é o início do ciclo seguinte.
  const todos = [
    { inicio: '2025-01-10', designado: 'João', conclusao: null, fechamentoForcado: true },
    { inicio: '2025-06-01', designado: 'Maria', conclusao: '2025-07-01' }
  ] as any[];
  // Ano de serviço 2025 (set/2024–ago/2025): os dois aparecem
  assertEq(linhaDoAno({ id: '1', nome: null }, todos, 2025).ciclos.length, 2);
  // Ano 2026 (set/2025–ago/2026): nenhum — o forçado terminou em 06/2025
  assertEq(linhaDoAno({ id: '1', nome: null }, todos, 2026).ciclos.length, 0);
});

test('ciclo travado além da margem SEM redesignação real depois: continua engolindo (só conclusão órfã não força)', () => {
  // 10 quadras, margem=2. Q1-Q6 concluídas cedo, Q7 concluída bem tarde
  // (conclusão órfã, sem nenhum evento real depois) — mas Q8/Q9/Q10
  // nunca são concluídas: faltam 3 > margem(2), não fecha; e como o único
  // evento posterior é a própria conclusão órfã (inferida), não força.
  const quadraIds = Array.from({ length: 10 }, (_, i) => `Q${i + 1}`);
  const conclusoes = [
    ...['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'].map((qid) => ({ quadra_id: qid, data: '2025-01-10' })),
    { quadra_id: 'Q7', data: '2025-08-01' }
  ];
  const ciclos = ciclosDoTerritorio(quadraIds, [{ data: '2025-01-01', nome: 'João' }], conclusoes);
  assertEq(ciclos.length, 1);
  assertEq(ciclos[0], { inicio: '2025-01-01', designado: 'João', conclusao: null });
});

test('território 29: quadra esquecida sozinha (órfã) não engole a redesignação real que vem depois', () => {
  // Cenário real reportado: uma quadra foi concluída sozinha em 22/04
  // (território "esquecido" — resto nunca terminou), e só em 04/07 o
  // território foi designado de novo de verdade, concluindo em 10/07. O
  // ciclo órfão de 22/04 não pode ficar aberto esperando o resto do
  // território indefinidamente e acabar fechando em 10/07 — isso
  // escondia a redesignação real de 04/07 do relatório.
  const quadraIds = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const eventos = [
    { data: '2026-02-21', nome: null }, // designação anterior (fecha sozinha, sem problema)
    { data: '2026-07-04', nome: null } // redesignação REAL — a que estava sendo engolida
  ];
  const conclusoes = [
    // ciclo anterior fecha limpo em 07/03
    ...quadraIds.map((qid) => ({ quadra_id: qid, data: '2026-03-07' })),
    // quadra esquecida, concluída sozinha bem depois — órfã
    { quadra_id: 'Q3', data: '2026-04-22' },
    // território retomado de verdade em 04/07, todas concluídas em 10/07
    ...quadraIds.map((qid) => ({ quadra_id: qid, data: '2026-07-10' }))
  ];
  const ciclos = ciclosDoTerritorio(quadraIds, eventos, conclusoes);
  assertEq(ciclos, [
    { inicio: '2026-02-21', designado: DESIGNADO_ARRANJO, conclusao: '2026-03-07' },
    {
      inicio: '2026-04-22',
      designado: DESIGNADO_ARRANJO,
      conclusao: '2026-04-22',
      inferido: true,
      fechamentoForcado: true
    },
    { inicio: '2026-07-04', designado: DESIGNADO_ARRANJO, conclusao: '2026-07-10' }
  ]);
});

test('território 29 real: SEM nenhuma designação/arranjo jamais registrado, quadra esquecida some por 73 dias', () => {
  // Dados reais extraídos do banco: território nunca passou pelo fluxo de
  // designação/arranjo (só "concluir quadra" direto no mapa). Sem NENHUM
  // evento real, proximoRealApos nunca ajuda — só o gap de silêncio (73
  // dias entre 22/04 e 04/07, > GAP_ABANDONO_DIAS=60) evita que o ciclo
  // órfão de 22/04 espere o território inteiro ser refeito e engula tudo
  // num ciclo só (22/04→10/07, o bug reportado).
  const quadraIds = ['29A', '29B', '29C', '29D', '29E'];
  const conclusoes = [
    { quadra_id: '29A', data: '2025-09-30' },
    { quadra_id: '29B', data: '2025-09-30' },
    { quadra_id: '29C', data: '2025-10-03' },
    { quadra_id: '29D', data: '2025-10-03' },
    { quadra_id: '29E', data: '2025-10-03' },
    { quadra_id: '29A', data: '2026-02-21' },
    { quadra_id: '29C', data: '2026-02-21' },
    { quadra_id: '29A', data: '2026-03-07' },
    { quadra_id: '29B', data: '2026-03-07' },
    { quadra_id: '29C', data: '2026-03-07' },
    { quadra_id: '29D', data: '2026-03-07' },
    { quadra_id: '29E', data: '2026-03-07' },
    { quadra_id: '29A', data: '2026-04-22' }, // quadra esquecida, sozinha
    { quadra_id: '29A', data: '2026-07-04' }, // 73 dias de silêncio depois — território retomado
    { quadra_id: '29B', data: '2026-07-07' },
    { quadra_id: '29C', data: '2026-07-08' },
    { quadra_id: '29D', data: '2026-07-08' },
    { quadra_id: '29E', data: '2026-07-10' }
  ];
  const ciclos = ciclosDoTerritorio(quadraIds, [], conclusoes);
  assertEq(ciclos, [
    { inicio: '2025-09-30', designado: DESIGNADO_ARRANJO, conclusao: '2025-10-03', inferido: true },
    { inicio: '2026-02-21', designado: DESIGNADO_ARRANJO, conclusao: '2026-03-07', inferido: true },
    {
      inicio: '2026-04-22',
      designado: DESIGNADO_ARRANJO,
      conclusao: '2026-04-22',
      inferido: true,
      fechamentoForcado: true
    },
    { inicio: '2026-07-04', designado: DESIGNADO_ARRANJO, conclusao: '2026-07-10', inferido: true }
  ]);
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

test('folhasImpressasS13: nenhum território estoura = 1 folha só, com TODOS os territórios', () => {
  const territorios = [
    { id: '1', nome: null, ciclos: [{ inicio: '2025-09-01', designado: 'A', conclusao: '2025-09-05' }] },
    { id: '2', nome: null, ciclos: [{ inicio: '2025-09-10', designado: 'B', conclusao: '2025-09-15' }] }
  ];
  const folhas = folhasImpressasS13(territorios, 2026, 4);
  assertEq(folhas.length, 1);
  assertEq(folhas[0].passada, 0);
  assertEq(folhas[0].linhas.map((l) => l.terr), ['1', '2']);
});

test('folhasImpressasS13: UM território estoura = folha nova com TODOS os territórios de novo', () => {
  // Terr 28 tem 6 ciclos (estoura as 4 colunas); os outros têm ≤4.
  const c28 = Array.from({ length: 6 }, (_, i) => ({
    inicio: `2025-${String(9 + i).padStart(2, '0')}-01`,
    designado: 'Arranjo',
    conclusao: `2025-${String(9 + i).padStart(2, '0')}-10`
  }));
  const territorios = [
    { id: '1', nome: null, ciclos: [{ inicio: '2025-09-01', designado: 'X', conclusao: '2026-06-19' }] },
    { id: '28', nome: 'Jardim Oceania', ciclos: c28 }
  ];
  const folhas = folhasImpressasS13(territorios, 2026, 4);
  // 6 ciclos → 2 passadas.
  assertEq(folhas.length, 2);

  // Passada 0: TODOS os territórios, primeiras 4 colunas.
  assertEq(folhas[0].passada, 0);
  assertEq(folhas[0].linhas.map((l) => l.terr), ['1', '28']);
  assertEq(folhas[0].linhas.find((l) => l.terr === '28')!.ciclos.length, 4);
  assertEq(folhas[0].linhas.find((l) => l.terr === '1')!.ciclos.length, 1);

  // Passada 1: TODOS os territórios DE NOVO (não só o 28).
  assertEq(folhas[1].passada, 1);
  assertEq(folhas[1].linhas.map((l) => l.terr), ['1', '28']);
  // 28 continua com os 2 ciclos excedentes; sua "última" = conclusão do
  // 4º ciclo (fim da passada anterior).
  const l28 = folhas[1].linhas.find((l) => l.terr === '28')!;
  assertEq(l28.ciclos.length, 2);
  assertEq(l28.ultima, '2025-12-10');
  // Terr 1 aparece na folha nova com nome + última data (sua última
  // conclusão) e SEM ciclos (colunas em branco pro servo continuar).
  const l1 = folhas[1].linhas.find((l) => l.terr === '1')!;
  assertEq(l1.ciclos.length, 0);
  assertEq(l1.ultima, '2026-06-19');
});

test('folhasImpressasS13: ordem NATURAL — 10 depois de 9, texto por último', () => {
  const territorios = ['10', '2', '1', 'Condomínio', '9'].map((id) => ({ id, nome: null, ciclos: [] }));
  const folhas = folhasImpressasS13(territorios, 2026, 4);
  assertEq(folhas[0].linhas.map((l) => l.terr), ['1', '2', '9', '10', 'Condomínio']);
});

test('folhasImpressasS13: território sem ciclo no ano ainda aparece (linha vazia)', () => {
  const folhas = folhasImpressasS13([{ id: '5', nome: null, ciclos: [] }], 2026, 4);
  assertEq(folhas.length, 1);
  assertEq(folhas[0].linhas, [{ terr: '5', nome: null, ultima: null, ciclos: [] }]);
});
