// Sugestão de "pare aqui". Duas propriedades importam mais que o
// resultado exato: (1) território pequeno não vira 4 sugestões e
// território sem nada por perto não inventa ponto; (2) a saída é
// ESTÁVEL — se a sugestão mudasse a cada recarga, ninguém confiaria.
import { test, assertEq, assertTrue } from './harness';
import { quantasParadas, sugerirParadas, ancoras, areaAproxKm2, type CandidatoParada } from '$lib/paradas';

// ~0.001° ≈ 111m. Grid pequeno = quarteirão; grid grande = bairro.
const c = (lat: number, lng: number) => ({ lat, lng });

test('quantasParadas: pequeno = 1, médio = 2-3, grande tem teto de 5', () => {
  assertEq(quantasParadas({ qtdQuadras: 0, areaAproxKm2: 0 }), 0);
  assertEq(quantasParadas({ qtdQuadras: 1, areaAproxKm2: 0.01 }), 1);
  assertEq(quantasParadas({ qtdQuadras: 2, areaAproxKm2: 0.5 }), 1);
  assertEq(quantasParadas({ qtdQuadras: 9, areaAproxKm2: 0.5 }), 3);
  assertEq(quantasParadas({ qtdQuadras: 30, areaAproxKm2: 5 }), 5);
});

test('quantasParadas: muitas quadras espremidas continuam merecendo 1 ponto', () => {
  // 12 quadras dentro de um quarteirão: o teto por ÁREA é quem manda
  assertEq(quantasParadas({ qtdQuadras: 12, areaAproxKm2: 0.05 }), 1);
});

test('areaAproxKm2: um ponto só não tem área; grid de ~1km² bate a ordem de grandeza', () => {
  assertEq(areaAproxKm2([c(-7.09, -34.84)]), 0);
  const a = areaAproxKm2([c(-7.09, -34.84), c(-7.081, -34.831)]);
  assertTrue(a > 0.8 && a < 1.3, `esperava ~1km², veio ${a}`);
});

test('ancoras: espalha pelos extremos e nunca repete o mesmo centro', () => {
  const centros = [c(-7.09, -34.84), c(-7.09, -34.839), c(-7.08, -34.83)];
  const a = ancoras(centros, 2);
  assertEq(a.length, 2);
  assertTrue(a[0].lat !== a[1].lat || a[0].lng !== a[1].lng, 'âncoras repetidas');
});

test('ancoras: saída é a MESMA independente da ordem do array de entrada', () => {
  const centros = [c(-7.09, -34.84), c(-7.085, -34.835), c(-7.08, -34.83)];
  const direta = ancoras(centros, 2);
  const embaralhada = ancoras([...centros].reverse(), 2);
  assertEq(direta, embaralhada);
});

test('território de 1 quadra: no máximo 1 sugestão', () => {
  const cands: CandidatoParada[] = [
    { id: 'a', nome: 'Estacionamento', lat: -7.0901, lng: -34.8401, fonte: 'osm', categoria: 'parking' },
    { id: 'b', nome: 'Praça', lat: -7.0902, lng: -34.8402, fonte: 'osm', categoria: 'square' }
  ];
  const r = sugerirParadas({ centrosQuadras: [c(-7.09, -34.84)], candidatos: cands });
  assertEq(r.length, 1);
});

test('nada dentro do raio: devolve VAZIO em vez de sugerir do outro lado do bairro', () => {
  const cands: CandidatoParada[] = [
    { id: 'longe', nome: 'Estacionamento longe', lat: -7.12, lng: -34.87, fonte: 'osm', categoria: 'parking' }
  ];
  const r = sugerirParadas({ centrosQuadras: [c(-7.09, -34.84)], candidatos: cands });
  assertEq(r.length, 0);
});

test('ponto SALVO ganha do POI do OSM à mesma distância (é o nome que a congregação usa)', () => {
  const cands: CandidatoParada[] = [
    { id: 'osm', nome: 'Estacionamento', lat: -7.0905, lng: -34.84, fonte: 'osm', categoria: 'parking' },
    { id: 'nosso', nome: 'Banco do Brasil da Fernando', lat: -7.0905, lng: -34.84, fonte: 'salvo' }
  ];
  const r = sugerirParadas({ centrosQuadras: [c(-7.09, -34.84)], candidatos: cands });
  assertEq(r[0].id, 'nosso');
});

test('mas um estacionamento MUITO mais perto ganha do ponto salvo distante', () => {
  const cands: CandidatoParada[] = [
    { id: 'perto', nome: 'Estacionamento na esquina', lat: -7.0901, lng: -34.84, fonte: 'osm', categoria: 'parking' },
    { id: 'salvo-longe', nome: 'Ponto salvo a 400m', lat: -7.0936, lng: -34.84, fonte: 'salvo' }
  ];
  const r = sugerirParadas({ centrosQuadras: [c(-7.09, -34.84)], candidatos: cands });
  assertEq(r[0].id, 'perto');
});

test('duas sugestões nunca saem coladas uma na outra', () => {
  const centros = [c(-7.09, -34.84), c(-7.08, -34.83)];
  const cands: CandidatoParada[] = [
    { id: 'a', nome: 'A', lat: -7.0901, lng: -34.8401, fonte: 'osm', categoria: 'parking' },
    { id: 'b', nome: 'B', lat: -7.09015, lng: -34.84015, fonte: 'osm', categoria: 'parking' }
  ];
  const r = sugerirParadas({ centrosQuadras: centros, candidatos: cands }, { n: 2, distMinEntreMetros: 200 });
  assertEq(r.length, 1);
});

test('território em dois blocos: uma sugestão perto de cada bloco', () => {
  // Dois grupos de quadras a ~1,1km um do outro
  const centros = [c(-7.09, -34.84), c(-7.0905, -34.8405), c(-7.08, -34.83), c(-7.0805, -34.8305)];
  const cands: CandidatoParada[] = [
    { id: 'norte', nome: 'Estac. Norte', lat: -7.0803, lng: -34.8303, fonte: 'osm', categoria: 'parking' },
    { id: 'sul', nome: 'Estac. Sul', lat: -7.0903, lng: -34.8403, fonte: 'osm', categoria: 'parking' }
  ];
  const r = sugerirParadas({ centrosQuadras: centros, candidatos: cands }, { n: 2 });
  assertEq(r.length, 2);
  assertEq([...r.map((x) => x.id)].sort(), ['norte', 'sul']);
});

test('mesma entrada, mesma saída (3 execuções) e ordem do array não importa', () => {
  const centros = [c(-7.09, -34.84), c(-7.08, -34.83)];
  const cands: CandidatoParada[] = [
    { id: 'a', nome: 'A', lat: -7.0903, lng: -34.8403, fonte: 'osm', categoria: 'parking' },
    { id: 'b', nome: 'B', lat: -7.0803, lng: -34.8303, fonte: 'salvo' }
  ];
  const r1 = sugerirParadas({ centrosQuadras: centros, candidatos: cands }, { n: 2 });
  const r2 = sugerirParadas({ centrosQuadras: centros, candidatos: cands }, { n: 2 });
  const r3 = sugerirParadas({ centrosQuadras: [...centros].reverse(), candidatos: [...cands].reverse() }, { n: 2 });
  assertEq(r1, r2);
  assertEq(r1.map((x) => x.id).sort(), r3.map((x) => x.id).sort());
});

test('entrada degenerada não explode: sem quadras, sem candidatos, coordenada inválida', () => {
  assertEq(sugerirParadas({ centrosQuadras: [], candidatos: [] }), []);
  assertEq(sugerirParadas({ centrosQuadras: [c(-7, -34)], candidatos: [] }), []);
  const cands: CandidatoParada[] = [
    { id: 'ruim', nome: 'NaN', lat: NaN, lng: NaN, fonte: 'osm' }
  ];
  assertEq(sugerirParadas({ centrosQuadras: [c(-7, -34)], candidatos: cands }), []);
});
