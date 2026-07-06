import { test, assertEq } from './harness';
import { statusCampanha } from '../src/lib/campanhas';
import { hojeIsoBrasil } from '../src/lib/utils/data';

// Mesmo relógio da função sob teste (dia do Brasil, não UTC) — senão o
// caso "início hoje" falha quando o teste roda entre 21h e 0h de Brasília
// (ou num runner UTC de madrugada).
function isoOffset(dias: number): string {
  return hojeIsoBrasil(dias);
}

test('campanha inativa é sempre encerrada, mesmo com datas futuras', () => {
  assertEq(statusCampanha({ ativa: false, data_inicio: isoOffset(10) }), 'encerrada');
});

test('campanha ativa com início no futuro é planejada', () => {
  assertEq(statusCampanha({ ativa: true, data_inicio: isoOffset(5) }), 'planejada');
});

test('campanha ativa com início hoje é em_andamento (hoje não é < hoje)', () => {
  assertEq(statusCampanha({ ativa: true, data_inicio: isoOffset(0) }), 'em_andamento');
});

test('campanha ativa com início no passado é em_andamento', () => {
  assertEq(statusCampanha({ ativa: true, data_inicio: isoOffset(-30) }), 'em_andamento');
});
