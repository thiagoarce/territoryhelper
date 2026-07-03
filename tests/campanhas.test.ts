import { test, assertEq } from './harness';
import { statusCampanha } from '../src/lib/campanhas';

function isoOffset(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
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
