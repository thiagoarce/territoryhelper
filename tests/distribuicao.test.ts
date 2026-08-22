// Sugestão de como repartir o território entre os grupos do dia.
// O que precisa ser verdade pra isso servir em campo:
//  - cada parte é CONTÍGUA (não adianta mandar a dupla pular quarteirão);
//  - todas as quadras entram, nenhuma duas vezes;
//  - pedir mais grupos que quadras não gera parte vazia;
//  - a primeira parte começa perto de onde o grupo parou.
import { test, assertEq, assertTrue } from './harness';
import {
  sugerirDistribuicao,
  filasDeQuadras,
  direcaoCardinal,
  type QuadraParaDistribuir
} from '$lib/distribuicao';

// Grade 3x3 de ~110m de lado (quarteirão urbano típico).
// lat cresce pro norte, lng cresce pro leste.
const grade: QuadraParaDistribuir[] = [];
for (let linha = 0; linha < 3; linha++) {
  for (let col = 0; col < 3; col++) {
    grade.push({
      id: `Q${linha}${col}`,
      lat: -7.09 - linha * 0.001,
      lng: -34.84 + col * 0.001,
      // quadra de verdade faz esquina: pega a rua da linha E a avenida
      // da coluna — assim a descrição acha rua comum em qualquer eixo
      ruas: [`Rua ${linha}`, `Av ${col}`]
    });
  }
}

test('filasDeQuadras: grade 3x3 vira 3 filas de 3', () => {
  const filas = filasDeQuadras(grade);
  assertEq(filas.length, 3);
  assertEq(filas.map((f) => f.length), [3, 3, 3]);
});

test('filasDeQuadras: coluna de quadras é UMA fila (é uma linha reta a percorrer)', () => {
  const coluna = [0, 1, 2].map((i) => ({ id: `C${i}`, lat: -7.09 - i * 0.002, lng: -34.84 }));
  const filas = filasDeQuadras(coluna);
  assertEq(filas.length, 1);
  assertEq(filas[0].length, 3);
});

test('todas as quadras entram, exatamente uma vez', () => {
  const partes = sugerirDistribuicao(grade, 3, { lat: -7.09, lng: -34.84 });
  const ids = partes.flatMap((p) => p.quadraIds);
  assertEq(ids.length, grade.length);
  assertEq(new Set(ids).size, grade.length);
});

test('3 grupos numa grade de 9: partes de 3 quadras cada', () => {
  const partes = sugerirDistribuicao(grade, 3, { lat: -7.09, lng: -34.84 });
  assertEq(partes.length, 3);
  assertEq(partes.map((p) => p.quadraIds.length), [3, 3, 3]);
});

test('divisão desigual: 4 grupos em 9 quadras → 3,2,2,2 (o resto vai pros primeiros)', () => {
  const partes = sugerirDistribuicao(grade, 4, { lat: -7.09, lng: -34.84 });
  assertEq(partes.map((p) => p.quadraIds.length), [3, 2, 2, 2]);
});

test('mais grupos que quadras não gera parte vazia', () => {
  const duas = grade.slice(0, 2);
  const partes = sugerirDistribuicao(duas, 5, null);
  assertEq(partes.length, 2);
  assertTrue(partes.every((p) => p.quadraIds.length > 0), 'parte vazia');
});

test('cada parte é contígua: quadras vizinhas, sem salto grande', () => {
  const partes = sugerirDistribuicao(grade, 3, { lat: -7.09, lng: -34.84 });
  const porId = new Map(grade.map((q) => [q.id, q]));
  for (const p of partes) {
    for (let i = 1; i < p.quadraIds.length; i++) {
      const a = porId.get(p.quadraIds[i - 1])!;
      const b = porId.get(p.quadraIds[i])!;
      const dLat = Math.abs(a.lat - b.lat);
      const dLng = Math.abs(a.lng - b.lng);
      // vizinha = no máximo um passo da grade em cada eixo
      assertTrue(dLat <= 0.00101 && dLng <= 0.00101, `${a.id}→${b.id} pulou quarteirão`);
    }
  }
});

test('a primeira parte começa perto de onde o grupo parou', () => {
  const noSul = sugerirDistribuicao(grade, 3, { lat: -7.0925, lng: -34.84 });
  const noNorte = sugerirDistribuicao(grade, 3, { lat: -7.0895, lng: -34.84 });
  // parando ao sul, começa pela linha de baixo (Q2x); ao norte, pela de cima (Q0x)
  assertTrue(noSul[0].quadraIds[0].startsWith('Q2'), `veio ${noSul[0].quadraIds[0]}`);
  assertTrue(noNorte[0].quadraIds[0].startsWith('Q0'), `veio ${noNorte[0].quadraIds[0]}`);
});

test('descrição é uma frase pra falar em voz alta, com a rua quando dá', () => {
  const partes = sugerirDistribuicao(grade, 3, { lat: -7.09, lng: -34.84 });
  assertTrue(partes[0].descricao.startsWith('Comecem pela '), partes[0].descricao);
  assertTrue(partes[0].descricao.includes('sigam em linha reta mais 2'), partes[0].descricao);
  assertTrue(/Rua |Av /.test(partes[0].descricao), partes[0].descricao);
  assertTrue(partes[1].descricao.startsWith('Peguem a '), partes[1].descricao);
});

test('entrada degenerada: sem quadra, zero grupos, coordenada inválida', () => {
  assertEq(sugerirDistribuicao([], 3, null), []);
  assertEq(sugerirDistribuicao(grade, 0, null), []);
  const ruim = [{ id: 'X', lat: NaN, lng: NaN }];
  assertEq(sugerirDistribuicao(ruim, 2, null), []);
});

test('direcaoCardinal fala como gente', () => {
  const centro = { lat: -7.09, lng: -34.84 };
  assertEq(direcaoCardinal(centro, { lat: -7.08, lng: -34.84 }), 'ao norte');
  assertEq(direcaoCardinal(centro, { lat: -7.1, lng: -34.84 }), 'ao sul');
  assertEq(direcaoCardinal(centro, { lat: -7.09, lng: -34.83 }), 'a leste');
  assertEq(direcaoCardinal(centro, { lat: -7.09, lng: -34.85 }), 'a oeste');
});
