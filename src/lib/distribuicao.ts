// Sugestão de COMO REPARTIR o território entre os grupos do dia.
//
// A cena real (o usuário desenhou isso à mão no cartão): o grupo chega,
// para num ponto, e o dirigente precisa dizer em voz alta "vocês pegam
// essa primeira e seguem em linha reta mais três", "vocês fazem a fila
// de baixo". Hoje ele faz isso de cabeça, olhando o mapa.
//
// A ideia aqui é produzir exatamente esse tipo de instrução: partes
// contíguas, descritas em português, ancoradas no ponto de parada.
//
// 100% PURA (sem rede, sem DOM) — testada em tests/distribuicao.test.ts.
import { distanciaMetros } from '$lib/utils/overpass';

export interface QuadraParaDistribuir {
  id: string;
  lat: number;
  lng: number;
  /** ruas da quadra, pra descrição ficar humana ("seguindo a R. X") */
  ruas?: string[];
}

export interface ParteSugerida {
  indice: number;
  quadraIds: string[];
  /** frase pronta pro dirigente falar */
  descricao: string;
  /** fila/faixa a que a parte pertence (1 = mais perto do ponto de parada) */
  fila: number;
}

/** Ângulo em graus (0 = leste, 90 = norte) entre dois pontos. */
function anguloGraus(de: { lat: number; lng: number }, para: { lat: number; lng: number }): number {
  const cosLat = Math.cos(((de.lat + para.lat) / 2 * Math.PI) / 180);
  return (Math.atan2(para.lat - de.lat, (para.lng - de.lng) * cosLat) * 180) / Math.PI;
}

const DIRECOES: [number, string][] = [
  [0, 'a leste'],
  [45, 'a nordeste'],
  [90, 'ao norte'],
  [135, 'a noroeste'],
  [180, 'a oeste'],
  [-135, 'a sudoeste'],
  [-90, 'ao sul'],
  [-45, 'a sudeste']
];

/** Diferença circular entre dois ângulos, em [0,180]. */
function difAngular(x: number, y: number): number {
  return Math.abs(((x - y + 540) % 360) - 180);
}

export function direcaoCardinal(
  de: { lat: number; lng: number },
  para: { lat: number; lng: number }
): string {
  const a = anguloGraus(de, para);
  let melhor = DIRECOES[0];
  let menor = Infinity;
  for (const d of DIRECOES) {
    const dist = difAngular(a, d[0]);
    if (dist < menor) {
      menor = dist;
      melhor = d;
    }
  }
  return melhor[1];
}

/**
 * Agrupa as quadras em FILAS (faixas perpendiculares ao eixo mais
 * comprido do território). É o que o dirigente enxerga como "a fila de
 * baixo", "a fileira de cima" — quarteirão urbano quase sempre vem em
 * grade.
 */
export function filasDeQuadras(quadras: QuadraParaDistribuir[]): QuadraParaDistribuir[][] {
  if (quadras.length === 0) return [];
  const lats = quadras.map((q) => q.lat);
  const lngs = quadras.map((q) => q.lng);
  const sw = { lat: Math.min(...lats), lng: Math.min(...lngs) };
  const alturaM = distanciaMetros(sw, { lat: Math.max(...lats), lng: sw.lng });
  const larguraM = distanciaMetros(sw, { lat: sw.lat, lng: Math.max(...lngs) });
  // A fila CORRE pelo eixo comprido e as filas se empilham no eixo
  // curto: território "deitado" tem fileiras horizontais (separadas por
  // latitude); território "em pé", fileiras verticais.
  const porLatitude = larguraM >= alturaM;

  // Posição da quadra no eixo que SEPARA as filas, em metros
  const eixoSeparador = (q: QuadraParaDistribuir) =>
    porLatitude
      ? distanciaMetros({ lat: sw.lat, lng: sw.lng }, { lat: q.lat, lng: sw.lng })
      : distanciaMetros({ lat: sw.lat, lng: sw.lng }, { lat: sw.lat, lng: q.lng });

  const ordenadas = [...quadras].sort((a, b) =>
    porLatitude ? b.lat - a.lat || a.lng - b.lng : a.lng - b.lng || b.lat - a.lat
  );

  // Limiar derivado do PRÓPRIO espaçamento das quadras, não fixo: um
  // valor chutado (130m) era maior que o quarteirão típico (~110m) e
  // fundia duas fileiras numa só. Aqui o corte é 60% do salto típico
  // entre fileiras vizinhas, com piso pra não picotar quadra colada.
  const posicoes = ordenadas.map(eixoSeparador);
  const saltos = posicoes
    .map((p, i) => (i === 0 ? 0 : Math.abs(p - posicoes[i - 1])))
    .filter((d) => d > 5)
    .sort((a, b) => a - b);
  const mediana = saltos.length > 0 ? saltos[Math.floor(saltos.length / 2)] : 0;
  const limiar = Math.max(40, mediana * 0.6);

  const filas: QuadraParaDistribuir[][] = [];
  let atual: QuadraParaDistribuir[] = [];
  ordenadas.forEach((q, i) => {
    if (atual.length === 0) {
      atual.push(q);
      return;
    }
    if (Math.abs(posicoes[i] - posicoes[i - 1]) <= limiar) atual.push(q);
    else {
      filas.push(atual);
      atual = [q];
    }
  });
  if (atual.length > 0) filas.push(atual);
  // dentro da fila, ordena ao longo do eixo (vira "siga em linha reta")
  for (const f of filas) f.sort((a, b) => (porLatitude ? a.lng - b.lng : a.lat - b.lat));
  return filas;
}

function ruaMaisComum(quadras: QuadraParaDistribuir[]): string | null {
  const cont = new Map<string, number>();
  for (const q of quadras) for (const r of q.ruas ?? []) cont.set(r, (cont.get(r) ?? 0) + 1);
  let melhor: string | null = null;
  let max = 1; // precisa aparecer em 2+ quadras pra valer como "a rua da parte"
  for (const [r, n] of cont) {
    if (n > max) {
      max = n;
      melhor = r;
    }
  }
  return melhor;
}

/**
 * Divide o território em `nGrupos` partes contíguas e descreve cada uma.
 *
 * Estratégia: enfileira as quadras percorrendo fila por fila (serpentina
 * — o fim de uma fila emenda no começo da seguinte, que é como um grupo
 * anda de verdade) e corta em blocos de tamanho parecido. Assim cada
 * parte fica contígua e a frase "pega essa e segue mais N" faz sentido.
 */
export function sugerirDistribuicao(
  quadras: QuadraParaDistribuir[],
  nGrupos: number,
  pontoParada?: { lat: number; lng: number } | null
): ParteSugerida[] {
  const validas = quadras.filter((q) => Number.isFinite(q.lat) && Number.isFinite(q.lng));
  if (validas.length === 0 || nGrupos <= 0) return [];
  const n = Math.min(nGrupos, validas.length); // 5 grupos e 3 quadras = 3 partes

  const filas = filasDeQuadras(validas);
  // Fila mais perto do ponto de parada vem primeiro — o primeiro grupo
  // começa onde todo mundo desceu do carro.
  const ancora = pontoParada ?? { lat: validas[0].lat, lng: validas[0].lng };
  const filasOrdenadas = [...filas].sort((a, b) => {
    const da = Math.min(...a.map((q) => distanciaMetros(ancora, q)));
    const db = Math.min(...b.map((q) => distanciaMetros(ancora, q)));
    return da - db;
  });

  // Serpentina: cada fila alterna o sentido, emendando com a anterior —
  // é como um grupo anda de verdade (chega no fim da rua e volta pela
  // de trás). A PRIMEIRA fila começa pela ponta mais perto de onde o
  // grupo parou; sem isso o dirigente mandava todo mundo atravessar o
  // território pra começar do outro lado.
  const primeiraFila = filasOrdenadas[0] ?? [];
  const comecarInvertido =
    primeiraFila.length > 1 &&
    distanciaMetros(ancora, primeiraFila[primeiraFila.length - 1]) < distanciaMetros(ancora, primeiraFila[0]);

  const sequencia: { quadra: QuadraParaDistribuir; fila: number }[] = [];
  filasOrdenadas.forEach((fila, i) => {
    const inverter = comecarInvertido ? i % 2 === 0 : i % 2 === 1;
    const ordenada = inverter ? [...fila].reverse() : fila;
    for (const q of ordenada) sequencia.push({ quadra: q, fila: i + 1 });
  });

  // Corta em n blocos de tamanho o mais parecido possível
  const base = Math.floor(sequencia.length / n);
  const sobra = sequencia.length % n;
  const partes: ParteSugerida[] = [];
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const tamanho = base + (i < sobra ? 1 : 0);
    const bloco = sequencia.slice(pos, pos + tamanho);
    pos += tamanho;
    if (bloco.length === 0) continue;
    const quadrasBloco = bloco.map((b) => b.quadra);
    const filaDoBloco = bloco[0].fila;
    const mesmaFila = bloco.every((b) => b.fila === filaDoBloco);
    partes.push({
      indice: i + 1,
      quadraIds: quadrasBloco.map((q) => q.id),
      fila: filaDoBloco,
      descricao: descrever(quadrasBloco, {
        mesmaFila,
        fila: filaDoBloco,
        totalFilas: filasOrdenadas.length,
        ancora,
        primeiraParte: i === 0
      })
    });
  }
  return partes;
}

function descrever(
  quadras: QuadraParaDistribuir[],
  ctx: {
    mesmaFila: boolean;
    fila: number;
    totalFilas: number;
    ancora: { lat: number; lng: number };
    primeiraParte: boolean;
  }
): string {
  const ids = quadras.map((q) => q.id);
  const primeira = quadras[0];
  const rua = ruaMaisComum(quadras);
  const partes: string[] = [];

  if (ctx.primeiraParte) partes.push(`Comecem pela ${ids[0]}`);
  else partes.push(`Peguem a ${ids[0]}`);

  if (ids.length > 1) {
    if (ctx.mesmaFila) {
      partes.push(
        `e sigam em linha reta mais ${ids.length - 1} (${ids.slice(1).join(', ')})`
      );
    } else {
      partes.push(`e continuem por ${ids.slice(1).join(', ')}`);
    }
  }

  const detalhes: string[] = [];
  if (rua) detalhes.push(`pela ${rua}`);
  if (ctx.totalFilas > 1 && ctx.mesmaFila) {
    detalhes.push(ctx.fila === 1 ? 'é a fila mais perto de onde pararam' : `${ctx.fila}ª fila a partir da parada`);
  }
  const dir = direcaoCardinal(ctx.ancora, primeira);
  if (!ctx.primeiraParte) detalhes.push(dir);

  return partes.join(' ') + (detalhes.length > 0 ? ` — ${detalhes.join(', ')}.` : '.');
}
