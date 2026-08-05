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
