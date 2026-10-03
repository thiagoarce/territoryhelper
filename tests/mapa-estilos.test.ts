// Fundo do mapa: a função que decide a URL é o único ponto onde um
// valor inválido (perfil antigo, preferência digitada errada, prop
// esquecida) pode virar `undefined` no construtor do MapLibre — que é
// mapa cinza sem erro nenhum no console.
import { test, assertEq, assertTrue } from './harness';
import { urlBasemap, ehBasemapValido, BASEMAPS, BASEMAP_CAMPO } from '$lib/mapa-estilos';

test('urlBasemap: os três estilos válidos apontam pro OpenFreeMap', () => {
  for (const b of ['positron', 'liberty', 'bright'] as const) {
    assertEq(urlBasemap(b), BASEMAPS[b]);
    assertTrue(urlBasemap(b).startsWith('https://tiles.openfreemap.org/styles/'), b);
  }
});

test('urlBasemap: valor inválido/ausente cai no positron (nunca undefined)', () => {
  assertEq(urlBasemap(null), BASEMAPS.positron);
  assertEq(urlBasemap(undefined), BASEMAPS.positron);
  assertEq(urlBasemap(''), BASEMAPS.positron);
  assertEq(urlBasemap('satellite'), BASEMAPS.positron);
  assertEq(urlBasemap('POSITRON'), BASEMAPS.positron); // case-sensitive de propósito
});

test('ehBasemapValido separa os conhecidos do resto', () => {
  assertEq(ehBasemapValido('liberty'), true);
  assertEq(ehBasemapValido('satellite'), false);
  assertEq(ehBasemapValido(null), false);
  assertEq(ehBasemapValido(3), false);
});

test('campo usa um estilo COM rótulo de comércio (não o cinza)', () => {
  // A queixa que originou isso: no positron o publicador não achava
  // referência nenhuma ("não sei onde esse mapa fica").
  assertTrue(BASEMAP_CAMPO !== 'positron', 'campo não pode nascer no cinza');
  assertTrue(ehBasemapValido(BASEMAP_CAMPO), 'campo precisa ser um estilo conhecido');
});

// --- ordem das camadas: quadras abaixo dos nomes de rua ---
// Fixture = ordem REAL das camadas dos estilos do OpenFreeMap (baixada
// em 2026-10, tests/fixtures-camadas-openfreemap.json). Se o provedor
// mudar o estilo, o teste continua checando a PROPRIEDADE que importa,
// não um id específico.
import { readFileSync } from 'node:fs';
import { ancoraAbaixoDosRotulos } from '$lib/mapa-estilos';

const estilosReais = JSON.parse(
  readFileSync(new URL('./fixtures-camadas-openfreemap.json', import.meta.url), 'utf8')
) as Record<string, [string, string][]>;

for (const [nome, pares] of Object.entries(estilosReais)) {
  test(`ancora (${nome}): tudo DEPOIS da âncora é texto — nada de prédio por cima das quadras`, () => {
    const camadas = pares.map(([id, type]) => ({ id, type }));
    const ancora = ancoraAbaixoDosRotulos(camadas);
    assertTrue(!!ancora, 'esperava achar o bloco de rótulos');
    const i = camadas.findIndex((c) => c.id === ancora);
    const depois = camadas.slice(i);
    assertTrue(
      depois.every((c) => c.type === 'symbol'),
      `camada não-texto acima das quadras: ${depois.filter((c) => c.type !== 'symbol').map((c) => c.id).join(', ')}`
    );
    // e o nome das ruas está nesse bloco (é o motivo de tudo isso)
    assertTrue(
      depois.some((c) => /road|street|highway|transportation/i.test(c.id)),
      'nome de rua ficou abaixo das quadras'
    );
  });
}

test('ancora: Liberty NÃO usa o 1º texto (a seta de mão única fica antes dos prédios)', () => {
  const camadas = estilosReais.liberty.map(([id, type]) => ({ id, type }));
  const primeiroTexto = camadas.find((c) => c.type === 'symbol')!.id;
  assertTrue(ancoraAbaixoDosRotulos(camadas) !== primeiroTexto, 'voltaria a esconder as quadras sob os prédios');
});

test('ancora: estilo sem nenhum texto empilha no topo (undefined), vazio idem', () => {
  assertEq(ancoraAbaixoDosRotulos([{ id: 'fundo', type: 'background' }, { id: 'agua', type: 'fill' }]), undefined);
  assertEq(ancoraAbaixoDosRotulos([]), undefined);
  assertEq(ancoraAbaixoDosRotulos(null), undefined);
});
