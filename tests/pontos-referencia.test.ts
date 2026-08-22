// Ponto de referência: a validação é o único filtro entre o formulário
// no celular e o banco. Coordenada ruim não dá erro visível — o ponto
// entra e some do mapa, e ninguém entende por quê.
import { test, assertEq, assertTrue } from './harness';
import {
  validarPonto,
  normalizarNomePonto,
  ehTipoPonto,
  mesclarSalvosComOsm,
  TIPOS_PONTO,
  type PontoReferencia
} from '$lib/pontos-referencia';

test('normalizarNomePonto: colapsa espaço e corta as pontas', () => {
  assertEq(normalizarNomePonto('  Banco   do  Brasil da Fernando '), 'Banco do Brasil da Fernando');
  assertEq(normalizarNomePonto('\n Padaria \t'), 'Padaria');
});

test('validarPonto: aceita o caso normal e normaliza o nome', () => {
  const r = validarPonto({ nome: '  Banco  do Brasil ', lat: -7.09, lng: -34.84, tipo: 'estacionamento' });
  assertTrue(r.ok, 'esperava ok');
  if (r.ok) {
    assertEq(r.nome, 'Banco do Brasil');
    assertEq(r.tipo, 'estacionamento');
    assertEq(r.lat, -7.09);
  }
});

test('validarPonto: tipo desconhecido cai em "referencia" em vez de estourar o check do banco', () => {
  const r = validarPonto({ nome: 'Praça', lat: 0, lng: 0, tipo: 'qualquer-coisa' });
  assertTrue(r.ok, 'esperava ok');
  if (r.ok) assertEq(r.tipo, 'referencia');
});

test('validarPonto: recusa nome vazio/curto e nome gigante', () => {
  assertEq(validarPonto({ nome: '', lat: 0, lng: 0 }).ok, false);
  assertEq(validarPonto({ nome: ' a ', lat: 0, lng: 0 }).ok, false);
  assertEq(validarPonto({ nome: 'x'.repeat(81), lat: 0, lng: 0 }).ok, false);
});

test('validarPonto: recusa coordenada ausente, NaN ou fora de faixa', () => {
  assertEq(validarPonto({ nome: 'Ponto', lat: null, lng: null }).ok, false);
  assertEq(validarPonto({ nome: 'Ponto', lat: 'abc', lng: -34.8 }).ok, false);
  assertEq(validarPonto({ nome: 'Ponto', lat: 95, lng: -34.8 }).ok, false);
  assertEq(validarPonto({ nome: 'Ponto', lat: -7, lng: 200 }).ok, false);
  // string numérica (vem assim do FormData) é aceita
  assertEq(validarPonto({ nome: 'Ponto', lat: '-7.09', lng: '-34.84' }).ok, true);
});

test('ehTipoPonto bate com a lista mostrada na tela (e com o check do banco)', () => {
  for (const t of TIPOS_PONTO) assertTrue(ehTipoPonto(t.valor), t.valor);
  assertEq(ehTipoPonto('parking'), false);
  assertEq(ehTipoPonto(null), false);
});

test('mesclarSalvosComOsm: POI já salvo não aparece duas vezes (fica o nosso apelido)', () => {
  const salvos = [
    { id: 1, nome: 'Banco do Brasil da Fernando', tipo: 'referencia', lat: -7, lng: -34, notas: null, quadra_id: null, territorio_id: null, osm_id: 'way/123' }
  ] as PontoReferencia[];
  const doOsm = [{ id: 'way/123', nome: 'Banco do Brasil' }, { id: 'node/9', nome: 'Padaria' }];
  const r = mesclarSalvosComOsm(salvos, doOsm);
  assertEq(r.doOsm.length, 1);
  assertEq(r.doOsm[0].id, 'node/9');
  assertEq(r.salvos.length, 1);
});
