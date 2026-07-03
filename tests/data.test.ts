// Regressão do bug "há -1 dias" (Date.now() ancorado em T12:00:00 dava
// negativo antes do meio-dia local). Ver $lib/utils/data.ts.
import { test, assertEq } from './harness';
import { diasDesde } from '../src/lib/utils/data';

function isoDe(diasAtras: number): string {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10);
}

test('conclusão hoje = 0 dias (nunca negativo)', () => {
  assertEq(diasDesde(isoDe(0)), 0);
});

test('conclusão ontem = 1 dia', () => {
  assertEq(diasDesde(isoDe(1)), 1);
});

test('conclusão há 30 dias = 30', () => {
  assertEq(diasDesde(isoDe(30)), 30);
});
