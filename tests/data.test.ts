// Regressão do bug "há -1 dias" (Date.now() ancorado em T12:00:00 dava
// negativo antes do meio-dia local). Ver $lib/utils/data.ts.
import { test, assertEq } from './harness';
import { diasDesde, diaDaSemana, ehFimDeSemana } from '../src/lib/utils/data';

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

test('diaDaSemana: datas conhecidas (2026)', () => {
  assertEq(diaDaSemana('2026-07-11'), 6); // sábado
  assertEq(diaDaSemana('2026-07-12'), 0); // domingo
  assertEq(diaDaSemana('2026-07-13'), 1); // segunda
  assertEq(diaDaSemana('2026-07-17'), 5); // sexta
});

test('ehFimDeSemana: sábado e domingo true, meio da semana false', () => {
  assertEq(ehFimDeSemana('2026-07-11'), true);
  assertEq(ehFimDeSemana('2026-07-12'), true);
  assertEq(ehFimDeSemana('2026-07-13'), false);
  assertEq(ehFimDeSemana('2026-07-17'), false);
});
