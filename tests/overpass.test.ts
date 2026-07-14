// Montagem da query Overpass — a regressão que já mordeu aqui é sutil:
// "praça" tem 3 seletores e a versão antiga colava eles numa string só
// com `;` no meio, então o (around:...) só valia pro ÚLTIMO statement —
// os outros pediam o PLANETA inteiro e o servidor devolvia 504 sempre.
import { test, assertEq, assertTrue } from './harness';
import { montarQueryOverpass } from '$lib/utils/overpass';

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
