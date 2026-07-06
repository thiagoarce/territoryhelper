import { test, assertEq } from './harness';
import { desfechoNoCicloAtual, cartaEscritaNoCiclo } from '../src/lib/ciclos';

// ── casa em casa: ciclo = última conclusão da quadra ──────────────────

test('desfecho sem registro nunca conta', () => {
  assertEq(desfechoNoCicloAtual(null, '2026-01-01'), false);
});

test('desfecho conta quando a quadra nunca foi concluída', () => {
  assertEq(desfechoNoCicloAtual('2024-03-10T14:00:00Z', null), true);
});

test('desfecho POSTERIOR à conclusão conta (ciclo novo)', () => {
  assertEq(desfechoNoCicloAtual('2026-02-01T09:00:00Z', '2026-01-15'), true);
});

test('desfecho ANTERIOR à conclusão não conta (ciclo fechado)', () => {
  assertEq(desfechoNoCicloAtual('2026-01-10T09:00:00Z', '2026-01-15'), false);
});

test('desfecho NO DIA da conclusão pertence ao ciclo que fechou', () => {
  assertEq(desfechoNoCicloAtual('2026-01-15T18:30:00Z', '2026-01-15'), false);
});

// ── cartas: ciclo global manual ───────────────────────────────────────

test('carta sem marca nunca conta', () => {
  assertEq(cartaEscritaNoCiclo(null, '2026-01-01'), false);
});

test('carta escrita vale quando nenhum ciclo foi iniciado', () => {
  assertEq(cartaEscritaNoCiclo('2023-05-05', null), true);
});

test('carta escrita NO dia do início do ciclo vale (inclusive)', () => {
  assertEq(cartaEscritaNoCiclo('2026-01-01', '2026-01-01'), true);
});

test('carta escrita depois do início do ciclo vale', () => {
  assertEq(cartaEscritaNoCiclo('2026-03-10', '2026-01-01'), true);
});

test('carta escrita ANTES do ciclo atual não vale mais', () => {
  assertEq(cartaEscritaNoCiclo('2025-12-20', '2026-01-01'), false);
});
