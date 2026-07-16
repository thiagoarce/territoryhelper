// Montagem da query Overpass — a regressão que já mordeu aqui é sutil:
// "praça" tem 3 seletores e a versão antiga colava eles numa string só
// com `;` no meio, então o (around:...) só valia pro ÚLTIMO statement —
// os outros pediam o PLANETA inteiro e o servidor devolvia 504 sempre.
import { test, assertEq, assertTrue } from './harness';
import { montarQueryOverpass, pontoDoRotulo, abreviarLogradouro, comprimentoMetros } from '$lib/utils/overpass';

test('comprimentoMetros: 0.001 grau de longitude no equador ≈ 111m', () => {
  const m = comprimentoMetros([[0, 0], [0.001, 0]]);
  assertTrue(Math.abs(m - 111.32) < 1, `esperava ~111m, veio ${m}`);
  assertEq(comprimentoMetros([[0, 0]]), 0);
});

test('overpass: todo statement tem o próprio filtro (around:...)', () => {
  const q = montarQueryOverpass(-7.09, -34.84, 800, ['square', 'parking']);
  const statements = q.match(/nw\[[^;]+;/g) ?? [];
  assertEq(statements.length, 4); // 3 seletores de praça + 1 de parking
  for (const s of statements) {
    assertTrue(s.includes('(around:800,-7.09,-34.84)'), `statement sem around: ${s}`);
  }
});

test('overpass: usa nw (área conta) e out center (way vem com centroide)', () => {
  const q = montarQueryOverpass(-7.09, -34.84, 800, ['parking']);
  assertTrue(q.includes('nw["amenity"="parking"]'), 'esperava nw, não node');
  assertTrue(q.includes('out center'), 'esperava out center');
  assertTrue(!q.includes('out body'), 'out body não traz centroide de way');
});

test('pontoDoRotulo: ancora no MEIO por distância (não vértice do meio)', () => {
  // 3 pontos, mas o 2º está pertinho do 1º — o meio geométrico da linha
  // cai no segmento longo, não no vértice 2.
  const p = pontoDoRotulo([[0, 0], [0.0001, 0], [1, 0]]);
  assertTrue(!!p, 'esperava ponto');
  assertTrue(Math.abs(p!.lng - 0.5) < 0.01, `meio ~0.5, veio ${p!.lng}`);
  assertTrue(Math.abs(p!.lat) < 1e-9, 'reta horizontal → lat 0');
});

test('pontoDoRotulo: rua vertical vira ângulo ~90 (nunca de cabeça pra baixo)', () => {
  // Segmento indo pra baixo na tela (lat decrescente). O ângulo é
  // normalizado pra (-90,90], então independe do sentido do desenho.
  const sobe = pontoDoRotulo([[0, 0], [0, 1]]);
  const desce = pontoDoRotulo([[0, 1], [0, 0]]);
  assertTrue(!!sobe && !!desce, 'esperava pontos');
  assertTrue(Math.abs(Math.abs(sobe!.angulo) - 90) < 0.5, `~90, veio ${sobe!.angulo}`);
  assertEq(Math.round(sobe!.angulo), Math.round(desce!.angulo)); // sentido não importa
});

test('pontoDoRotulo: degenerado (pontos iguais / 1 ponto) → null', () => {
  assertEq(pontoDoRotulo([[0, 0]]), null);
  assertEq(pontoDoRotulo([[0, 0], [0, 0]]), null);
});

test('abreviarLogradouro: encurta só o tipo, mantém o nome', () => {
  assertEq(abreviarLogradouro('Rua Pastor Josebias Fialho Marinho'), 'R. Pastor Josebias Fialho Marinho');
  assertEq(abreviarLogradouro('Avenida Epitácio Pessoa'), 'Av. Epitácio Pessoa');
  assertEq(abreviarLogradouro('Praça da Independência'), 'Pç. da Independência');
  assertEq(abreviarLogradouro('Beco Sem Saída'), 'Beco Sem Saída'); // tipo não mapeado fica igual
});
