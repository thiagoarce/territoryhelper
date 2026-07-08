// U1: ordenação automática ao redor do centro da quadra (sentido
// horário) quando não há ordem_na_quadra manual. Ver $lib/utils/geo.ts.
import { test, assertEq } from './harness';
import { centroidePoligono, ordenarPorAngulo } from '../src/lib/utils/geo';

function ponto(id: number, lng: number, lat: number) {
  return { id, geo_geojson: { type: 'Point' as const, coordinates: [lng, lat] as [number, number] } };
}

test('centroidePoligono: média dos vértices de um quadrado', () => {
  const poly = {
    type: 'Polygon',
    coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]]
  };
  const c = centroidePoligono(poly);
  assertEq(c?.lat, 0.8); // (0+2+2+0+0)/5
  assertEq(c?.lng, 0.8);
});

test('centroidePoligono: sem coordinates devolve null', () => {
  assertEq(centroidePoligono(null), null);
  assertEq(centroidePoligono({ type: 'Polygon' }), null);
});

test('ordenarPorAngulo: dá a volta no sentido horário a partir do centro', () => {
  const centro = { lat: 0, lng: 0 };
  // N, L, S, O em torno do centro, embaralhados na entrada.
  const norte = ponto(1, 0, 1);
  const leste = ponto(2, 1, 0);
  const sul = ponto(3, 0, -1);
  const oeste = ponto(4, -1, 0);
  const ordenado = ordenarPorAngulo(centro, [sul, oeste, norte, leste]);
  // Ciclo horário N→L→S→O; o sort (ascendente por ângulo, -pi a pi) só
  // muda o PONTO DE PARTIDA do ciclo, não a ordem relativa — começa em O.
  assertEq(ordenado.map((p) => p.id).join(','), '4,1,2,3'); // O, N, L, S
});

test('ordenarPorAngulo: local sem geo_geojson vai pro fim', () => {
  const centro = { lat: 0, lng: 0 };
  const comGeo = ponto(1, 1, 0);
  const semGeo = { id: 2, geo_geojson: null };
  const ordenado = ordenarPorAngulo(centro, [semGeo, comGeo]);
  assertEq(ordenado.map((p) => p.id).join(','), '1,2');
});
