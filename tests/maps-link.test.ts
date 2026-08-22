// Link do Google Maps → local. A extração é pura; o que pode dar
// errado é sutil: link que NÃO tem coordenada (o caso real testado com
// o link do usuário), e o (0,0) que o Google usa de placeholder e vira
// um ponto no meio do Atlântico se a gente aceitar.
import { test, assertEq, assertTrue } from './harness';
import {
  ehLinkGoogleMaps,
  ehLinkCurto,
  extrairDoLinkMaps,
  consultaParaGeocodificar,
  urlCompartilhavel
} from '$lib/maps-link';

test('reconhece link do Maps (curto e longo) e rejeita o resto', () => {
  assertEq(ehLinkGoogleMaps('https://maps.app.goo.gl/CR5K3oRQxFkUDToi7'), true);
  assertEq(ehLinkGoogleMaps('https://www.google.com/maps/place/Parahyba+Mall/@-7.08,-34.83,17z'), true);
  assertEq(ehLinkGoogleMaps('https://maps.google.com/?q=-7.08,-34.83'), true);
  assertEq(ehLinkGoogleMaps('https://waze.com/ul?ll=-7.08,-34.83'), false);
  assertEq(ehLinkGoogleMaps('conversa fiada'), false);
  assertEq(ehLinkCurto('https://maps.app.goo.gl/abc'), true);
  assertEq(ehLinkCurto('https://www.google.com/maps/place/X/@-7,-34,17z'), false);
});

test('link longo com !3d!4d: coordenada EXATA do lugar', () => {
  const r = extrairDoLinkMaps(
    'https://www.google.com/maps/place/Parahyba+Mall/@-7.0811,-34.8391,17z/data=!3m1!4b1!4m6!3m5!1s0x7acdddcdb91209d:0xa863e47432b65597!8m2!3d-7.0810237!4d-34.8392062'
  );
  assertEq(r.confianca, 'exata');
  assertEq(r.lat, -7.0810237);
  assertEq(r.lng, -34.8392062);
  assertEq(r.nome, 'Parahyba Mall');
});

test('link com @lat,lng (sem !3d) também resolve', () => {
  const r = extrairDoLinkMaps('https://www.google.com/maps/@-7.0810237,-34.8392062,18z');
  assertEq(r.confianca, 'exata');
  assertEq(r.lat, -7.0810237);
});

test('?q=lat,lng (pino solto) resolve', () => {
  const r = extrairDoLinkMaps('https://maps.google.com/?q=-7.0810237,-34.8392062');
  assertEq(r.confianca, 'exata');
  assertEq(r.lng, -34.8392062);
});

test('CASO REAL do link curto resolvido: nome e endereço, SEM coordenada', () => {
  // Foi exatamente isso que voltou ao seguir o goo.gl do usuário
  const r = extrairDoLinkMaps(
    'https://www.google.com/maps?q=Parahyba+Mall+-+R.+Bacharel+Jos%C3%A9+de+Oliveira+Curchatuz,+850+-+Jardim+Oceania,+Jo%C3%A3o+Pessoa+-+PB,+58037-432&ftid=0x7acdddcdb91209d:0xa863e47432b65597'
  );
  assertEq(r.confianca, 'sem_coordenada');
  assertEq(r.lat, null);
  assertEq(r.nome, 'Parahyba Mall');
  assertTrue(!!r.endereco?.includes('Jardim Oceania'), `endereço: ${r.endereco}`);
});

test('(0,0) do Google é placeholder, não vira ponto no Atlântico', () => {
  const r = extrairDoLinkMaps('https://maps.google.com/?q=0,0');
  assertEq(r.lat, null);
  assertEq(r.confianca, 'sem_coordenada');
});

test('URL inválida não explode', () => {
  const r = extrairDoLinkMaps('nem url é');
  assertEq(r.confianca, 'sem_coordenada');
  assertEq(r.nome, null);
});

test('consulta pro geocoder usa NOME + cidade (o endereço com número erra)', () => {
  const q = consultaParaGeocodificar({
    nome: 'Parahyba Mall',
    endereco: 'R. Bacharel José de Oliveira Curchatuz, 850 - Jardim Oceania, João Pessoa - PB, 58037-432'
  });
  assertEq(q, 'Parahyba Mall, João Pessoa');
  // sem nome, cai no endereço
  assertEq(consultaParaGeocodificar({ nome: null, endereco: 'Praça da Independência' }), 'Praça da Independência');
  assertEq(consultaParaGeocodificar({ nome: null, endereco: null }), null);
});

test('compartilhar usa o link original quando existe (é o que a congregação conhece)', () => {
  assertEq(
    urlCompartilhavel({ maps_url: 'https://maps.app.goo.gl/abc', lat: -7, lng: -34 }),
    'https://maps.app.goo.gl/abc'
  );
  assertTrue(
    urlCompartilhavel({ maps_url: null, lat: -7.08, lng: -34.83 }).includes('query=-7.08,-34.83'),
    'sem link salvo, monta pela coordenada'
  );
});
