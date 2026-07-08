// U1: ordenação automática dos endereços de uma quadra quando não há
// ordem_na_quadra manual. Ver $lib/utils/geo.ts — nearest-neighbor a
// partir do ponto mais distante do centro (troca do ângulo-em-torno-
// do-centro anterior, que zigzagueava em quadras finas/alongadas: uso
// real reportou 8,7,6,5,4,3 depois pulando pra 12,10,11 numa quadra
// que é uma fileira de casas ao longo de uma avenida).
import { test, assertEq } from './harness';
import { centroidePoligono, ordenarPorCaminho } from '../src/lib/utils/geo';

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

test('ordenarPorCaminho: caminha sem voltar em quadra fina/alongada (regressão do zigzag)', () => {
  // 8 casas numa linha reta (fileira ao longo de uma avenida) + 2
  // "prédios" um pouco fora da linha, mesmo formato do caso real que
  // zigzagueava com o ângulo-em-torno-do-centro.
  const casas = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ponto(i, i, 0));
  const predios = [ponto(9, 9, 0.05), ponto(10, 10.5, -0.05)];
  const centro = { lat: 0, lng: 5.75 };
  const ordenado = ordenarPorCaminho(centro, [...casas, ...predios]);
  // Percurso monotônico de uma ponta à outra — sem saltos pra trás.
  assertEq(ordenado.map((p) => p.id).join(','), '10,9,8,7,6,5,4,3,2,1');
});

test('ordenarPorCaminho: começa na extremidade mais distante do centro', () => {
  const centro = { lat: 0, lng: 0 };
  const norte = ponto(1, 0, 1);
  const leste = ponto(2, 1, 0);
  const sul = ponto(3, 0, -1);
  const oeste = ponto(4, -1, 0);
  const ordenado = ordenarPorCaminho(centro, [sul, oeste, norte, leste]);
  assertEq(ordenado.map((p) => p.id).join(','), '3,4,1,2');
});

test('ordenarPorCaminho: local sem geo_geojson vai pro fim', () => {
  const centro = { lat: 0, lng: 0 };
  const comGeo = ponto(1, 1, 0);
  const semGeo = { id: 2, geo_geojson: null };
  const ordenado = ordenarPorCaminho(centro, [semGeo, comGeo]);
  assertEq(ordenado.map((p) => p.id).join(','), '1,2');
});

test('ordenarPorCaminho: sem centro (null), usa o primeiro ponto como referência', () => {
  const casas = [1, 2, 3].map((i) => ponto(i, i, 0));
  const ordenado = ordenarPorCaminho(null, casas);
  assertEq(ordenado.length, 3);
});
