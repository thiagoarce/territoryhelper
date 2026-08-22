// Sugestão de "pare aqui": dado um território (as quadras designadas),
// escolhe onde o grupo pode estacionar. Território grande merece mais
// de um ponto; território pequeno, um; sem candidato razoável por
// perto, NENHUM — devolver vazio é resposta honesta, melhor que
// inventar um ponto a 2km.
//
// 100% PURA (zero rede, zero dependência): quem busca os candidatos é a
// tela (pontos salvos do payload + POIs da Overpass). Testada em
// tests/paradas.test.ts.
import { distanciaMetros } from '$lib/utils/overpass';

export interface CandidatoParada {
  id: string;
  nome: string;
  lat: number;
  lng: number;
  /** 'salvo' = ponto da congregação (nome que todos usam) */
  fonte: 'salvo' | 'osm';
  categoria?: string;
}

export interface SugestaoParada extends CandidatoParada {
  /** índice da âncora (grupo de quadras) que este ponto atende */
  ancoraIdx: number;
  distanciaMetros: number;
}

export interface Ponto {
  lat: number;
  lng: number;
}

// Calibração dos pesos, em "metros equivalentes" (a penalidade é
// distância/100, então 1 ponto de bônus ≈ tolerar 100m a mais):
//   ponto salvo  = +3 → vence um POI qualquer até ~300m mais longe,
//                       mas NÃO vence um estacionamento na esquina.
//   estacionamento = +2 → o que a gente procura de verdade.
// O primeiro chute (salvo +8) equivalia a 800m de caminhada: mandava o
// grupo atravessar o bairro só porque o ponto tinha nome nosso.
const BONUS_FONTE: Record<CandidatoParada['fonte'], number> = { salvo: 3, osm: 0 };
const BONUS_CATEGORIA: Record<string, number> = {
  parking: 2,
  estacionamento: 2,
  fuel: 1,
  supermarket: 0.5,
  square: 0.5
};

/**
 * Quantas paradas o território merece. Escala pelo NÚMERO de quadras e
 * pela área — 12 quadras espremidas num quarteirão não precisam de 4
 * pontos de encontro.
 */
export function quantasParadas(entrada: { qtdQuadras: number; areaAproxKm2: number }): number {
  const { qtdQuadras, areaAproxKm2 } = entrada;
  if (qtdQuadras <= 0) return 0;
  if (qtdQuadras <= 2 || areaAproxKm2 < 0.06) return 1;
  const porQuadra = Math.ceil(qtdQuadras / 3);
  const porArea = Math.ceil(areaAproxKm2 / 0.15);
  return Math.max(1, Math.min(5, porQuadra, porArea));
}

/** Área aproximada (km²) do retângulo que cobre os centros das quadras. */
export function areaAproxKm2(centros: Ponto[]): number {
  if (centros.length < 2) return 0;
  const lats = centros.map((c) => c.lat);
  const lngs = centros.map((c) => c.lng);
  const sw = { lat: Math.min(...lats), lng: Math.min(...lngs) };
  const ne = { lat: Math.max(...lats), lng: Math.max(...lngs) };
  const alturaM = distanciaMetros(sw, { lat: ne.lat, lng: sw.lng });
  const larguraM = distanciaMetros(sw, { lat: sw.lat, lng: ne.lng });
  return (alturaM * larguraM) / 1_000_000;
}

/**
 * Âncoras = pontos bem espalhados pelo território (farthest-point
 * sampling). DETERMINÍSTICO de propósito: começa pelo centro mais
 * distante do centro médio e resolve empate por lat/lng, então a mesma
 * entrada dá sempre a mesma saída, em qualquer ordem de array — sem
 * isso a sugestão "dançava" a cada recarga da tela.
 */
export function ancoras(centros: Ponto[], n: number): Ponto[] {
  if (centros.length === 0 || n <= 0) return [];
  const ordemEstavel = [...centros].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  const medio = {
    lat: ordemEstavel.reduce((s, c) => s + c.lat, 0) / ordemEstavel.length,
    lng: ordemEstavel.reduce((s, c) => s + c.lng, 0) / ordemEstavel.length
  };
  const escolhidas: Ponto[] = [];
  let primeiro = ordemEstavel[0];
  let melhorD = -1;
  for (const c of ordemEstavel) {
    const d = distanciaMetros(medio, c);
    if (d > melhorD) { melhorD = d; primeiro = c; }
  }
  escolhidas.push(primeiro);
  while (escolhidas.length < Math.min(n, ordemEstavel.length)) {
    let alvo: Ponto | null = null;
    let melhor = -1;
    for (const c of ordemEstavel) {
      if (escolhidas.some((e) => e.lat === c.lat && e.lng === c.lng)) continue;
      const dMin = Math.min(...escolhidas.map((e) => distanciaMetros(e, c)));
      if (dMin > melhor) { melhor = dMin; alvo = c; }
    }
    if (!alvo) break;
    escolhidas.push(alvo);
  }
  return escolhidas;
}

export interface OpcoesSugestao {
  /** distância máxima entre a âncora e o ponto sugerido */
  raioMaxMetros?: number;
  /** duas sugestões não podem ficar coladas uma na outra */
  distMinEntreMetros?: number;
  /** força a quantidade (senão deriva de quantasParadas) */
  n?: number;
}

/**
 * Escolhe as paradas. Para cada âncora pega o candidato de maior score
 * (bônus por ser ponto NOSSO, bônus por categoria, penalidade por
 * distância). Âncora sem candidato dentro do raio é PULADA — a saída
 * pode ter menos que N, e isso é proposital.
 */
export function sugerirParadas(
  entrada: { centrosQuadras: Ponto[]; candidatos: CandidatoParada[] },
  opts: OpcoesSugestao = {}
): SugestaoParada[] {
  const raioMax = opts.raioMaxMetros ?? 500;
  const distMin = opts.distMinEntreMetros ?? 200;
  const centros = entrada.centrosQuadras.filter(
    (c) => Number.isFinite(c.lat) && Number.isFinite(c.lng)
  );
  if (centros.length === 0 || entrada.candidatos.length === 0) return [];

  const n = opts.n ?? quantasParadas({ qtdQuadras: centros.length, areaAproxKm2: areaAproxKm2(centros) });
  if (n <= 0) return [];

  const alvos = ancoras(centros, n);
  const escolhidas: SugestaoParada[] = [];

  for (let i = 0; i < alvos.length; i++) {
    const ancora = alvos[i];
    let melhor: SugestaoParada | null = null;
    let melhorScore = -Infinity;
    for (const c of entrada.candidatos) {
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
      if (escolhidas.some((e) => e.id === c.id)) continue;
      const d = distanciaMetros(ancora, c);
      if (d > raioMax) continue;
      if (escolhidas.some((e) => distanciaMetros(e, c) < distMin)) continue;
      const score =
        BONUS_FONTE[c.fonte] + (c.categoria ? (BONUS_CATEGORIA[c.categoria] ?? 0) : 0) - d / 100;
      // Empate resolvido pelo id, pra saída estável
      if (score > melhorScore || (score === melhorScore && melhor && c.id < melhor.id)) {
        melhorScore = score;
        melhor = { ...c, ancoraIdx: i, distanciaMetros: Math.round(d) };
      }
    }
    if (melhor) escolhidas.push(melhor);
  }
  return escolhidas;
}
