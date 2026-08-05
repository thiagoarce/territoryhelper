// Helper pra Overpass API (OSM) — busca POIs perto de um centro.
// Free, sem chave, mas tem rate limit. Cache simples in-memory.

export type CategoriaPOI =
  | 'parking' | 'pharmacy' | 'square' | 'fuel' | 'supermarket' | 'bakery'
  // Referências de ORIENTAÇÃO (queixa real: "não sei onde esse mapa
  // fica") — é assim que a congregação se localiza: "é no Banco do
  // Brasil da Fernando", "atrás da escola", "perto da igreja".
  | 'bank' | 'school' | 'church' | 'hospital';

/** As categorias que o botão "Referências" liga de uma vez. */
export const REFERENCIAS: CategoriaPOI[] = ['bank', 'school', 'church', 'hospital', 'supermarket'];

export interface POI {
  id: string;
  lat: number;
  lng: number;
  nome: string;
  categoria: CategoriaPOI;
}

// Um ARRAY de seletores por categoria — cada um vira um statement
// PRÓPRIO com o (around:...) DELE na query. A versão anterior guardava
// os 3 seletores de "praça" numa string só com `;` no meio: o raio só
// se aplicava ao ÚLTIMO statement e os dois primeiros ficavam SEM
// filtro espacial — a query pedia todos os parques do PLANETA e o
// Overpass devolvia 504 sempre (bug real: "Falhou buscar" em qualquer
// clique em Praça).
const seletoresPorCategoria: Record<CategoriaPOI, string[]> = {
  parking: ['["amenity"="parking"]'],
  pharmacy: ['["amenity"="pharmacy"]'],
  square: ['["leisure"="park"]', '["leisure"="garden"]', '["place"="square"]'],
  fuel: ['["amenity"="fuel"]'],
  supermarket: ['["shop"="supermarket"]'],
  bakery: ['["shop"="bakery"]'],
  bank: ['["amenity"="bank"]'],
  school: ['["amenity"="school"]'],
  church: ['["amenity"="place_of_worship"]'],
  hospital: ['["amenity"="hospital"]', '["amenity"="clinic"]']
};

// Exportada só pra teste (tests/overpass.test.ts) — a regressão que já
// mordeu aqui é sutil demais pra confiar em olho: TODO statement precisa
// do próprio (around:...).
export function montarQueryOverpass(
  lat: number,
  lng: number,
  raioMetros: number,
  categorias: CategoriaPOI[]
): string {
  const blocos = categorias
    .flatMap((c) => seletoresPorCategoria[c])
    // `nw` (node+way), não só `node`: estacionamento, praça, mercado e
    // posto quase sempre são mapeados como ÁREA (way) no OSM — só node
    // achava quase nada mesmo quando a query funcionava. Relation fica
    // de fora de propósito: é caro no servidor (os públicos já vivem no
    // limite) e POI de bairro como relation é raridade.
    .map((sel) => `nw${sel}(around:${raioMetros},${lat},${lng});`)
    .join('');
  // `out center 200`: way não tem lat/lon próprio — `center` manda o
  // centroide. O limite era 60 e é do TOTAL da resposta: em área densa
  // (praça tem 3 seletores) o corte caía antes dos POIs mais PERTO do
  // centro, porque a Overpass não ordena por distância — dava "nada
  // encontrado" com estacionamento na esquina. 200 continua uma resposta
  // pequena e quem ordena/corta por distância somos nós.
  // `timeout:6` MENOR que o abort do fetch (8s) de propósito: o servidor
  // desiste antes do client, então resposta lenta-mas-viva ainda chega
  // em vez de ser abortada no meio.
  return `[out:json][timeout:6];(${blocos});out center 200;`;
}

// O overpass-api.de (instância pública principal) vive sobrecarregado e
// devolve 504 "server too busy" — visto ao vivo no diagnóstico deste
// bug, inclusive pra query trivial. Fallback em cadeia: tenta o próximo
// espelho quando um falha, e LEMBRA qual funcionou pra começar por ele
// na próxima busca da sessão. Todos mandam Access-Control-Allow-Origin:*
// (verificado — o fetch roda no browser, sem CORS nada funciona).
// Ordem importa: o kumi.systems foi o mais confiável no diagnóstico, o
// overpass-api.de é o que mais devolve 504 "server too busy", e o
// maps.mail.ru é o mais distante/instável — ficam nessa ordem como
// desempate quando não há memória de qual funcionou.
const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];
const CHAVE_ENDPOINT = 'th:overpass-endpoint';

// Memória do espelho bom. Era só variável de módulo: recarregar o app
// (ou navegar com reload) zerava e a próxima busca recomeçava pelo
// espelho ruim. Persistir em localStorage faz a 2ª sessão já nascer
// certa. Leitura defensiva — SSR e modo privado não têm localStorage.
let endpointBomIdx = (() => {
  try {
    const v = parseInt(localStorage.getItem(CHAVE_ENDPOINT) ?? '', 10);
    return Number.isFinite(v) && v >= 0 && v < ENDPOINTS.length ? v : 0;
  } catch {
    return 0;
  }
})();

function lembrarEndpoint(idx: number) {
  endpointBomIdx = idx;
  try { localStorage.setItem(CHAVE_ENDPOINT, String(idx)); } catch {}
}

/** Falha da Overpass, com o motivo separado — a UI diz coisas diferentes
 *  pra "você está sem internet" e "os servidores do OSM estão ocupados",
 *  e antes as duas viravam o mesmo toast genérico. */
export class OverpassIndisponivel extends Error {
  motivo: 'sem_rede' | 'servidores';
  constructor(motivo: 'sem_rede' | 'servidores', causa?: unknown) {
    super(motivo === 'sem_rede' ? 'Sem conexão' : 'Servidores do OpenStreetMap indisponíveis');
    this.name = 'OverpassIndisponivel';
    this.motivo = motivo;
    if (causa) (this as any).cause = causa;
  }
}

async function postOverpass(
  endpoint: string,
  query: string,
  sinalExterno?: AbortSignal,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<any> {
  // Timeout no fetch em si (o `[timeout:6]` da query só limita a
  // execução DENTRO do servidor — conexão travada precisa de abort).
  // 8s > 6s da query: dá tempo da resposta lenta chegar inteira, mas o
  // usuário não fica 13s no escuro como antes.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const abortarPorFora = () => ctrl.abort();
  sinalExterno?.addEventListener('abort', abortarPorFora);
  try {
    const resp = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: ctrl.signal
    });
    if (!resp.ok) throw new Error('Overpass falhou: ' + resp.status);
    return await resp.json();
  } finally {
    clearTimeout(timer);
    sinalExterno?.removeEventListener('abort', abortarPorFora);
  }
}

/**
 * Dispara os espelhos EM PARALELO e fica com o primeiro que responder,
 * abortando os outros. Antes era em série: com o primeiro espelho fora
 * do ar (o caso comum), o publicador esperava 13s + 13s antes de ver
 * qualquer coisa e desistia achando que "não funciona" — a queixa real.
 * O espelho vencedor é lembrado, então a busca seguinte tenta ele
 * sozinho primeiro (1 request, não 3).
 */
export async function comFallback(
  query: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<any> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OverpassIndisponivel('sem_rede');
  }
  // 1ª tentativa: só o espelho lembrado (barato, e é o caso comum)
  try {
    return await postOverpass(ENDPOINTS[endpointBomIdx], query, undefined, fetchImpl);
  } catch (e) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new OverpassIndisponivel('sem_rede', e);
    }
  }
  // 2ª tentativa: corrida entre TODOS (inclusive o que acabou de falhar —
  // 504 do Overpass é intermitente e pode passar no retry)
  const ctrl = new AbortController();
  let ultimoErro: unknown = null;
  const tentativas = ENDPOINTS.map((url, idx) =>
    postOverpass(url, query, ctrl.signal, fetchImpl).then(
      (json) => ({ json, idx }),
      (e) => {
        ultimoErro = e;
        throw e;
      }
    )
  );
  try {
    const vencedor = await (Promise as any).any(tentativas);
    lembrarEndpoint(vencedor.idx);
    return vencedor.json;
  } catch {
    throw new OverpassIndisponivel('servidores', ultimoErro);
  } finally {
    ctrl.abort(); // corta os perdedores (não deixa request órfã no celular)
  }
}

/** Distância aproximada em metros (equiretangular local — sobra pra
 *  distância de bairro e não precisa de trigonometria de esfera). */
export function distanciaMetros(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const cosLat = Math.cos(((a.lat + b.lat) / 2 * Math.PI) / 180);
  return Math.hypot((b.lng - a.lng) * cosLat, b.lat - a.lat) * 111320;
}

/** Mais perto primeiro. Pura — a Overpass devolve em ordem de id. */
export function ordenarPorDistancia<T extends { lat: number; lng: number }>(
  itens: T[],
  centro: { lat: number; lng: number }
): T[] {
  return [...itens].sort((x, y) => distanciaMetros(centro, x) - distanciaMetros(centro, y));
}

const cache = new Map<string, { ts: number; data: POI[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface ResultadoPOIs {
  pois: POI[];
  /** raio que de fato produziu o resultado (pode ser o dobro do pedido) */
  raioUsado: number;
  /** true quando o raio pedido não achou nada e o dobro achou */
  ampliado: boolean;
  deCache: boolean;
}

async function buscarPOIsUmRaio(
  lat: number,
  lng: number,
  raioMetros: number,
  categorias: CategoriaPOI[]
): Promise<{ pois: POI[]; deCache: boolean }> {
  const chave = `${lat.toFixed(4)},${lng.toFixed(4)},${raioMetros},${[...categorias].sort().join(',')}`;
  const cached = cache.get(chave);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return { pois: cached.data, deCache: true };

  const query = montarQueryOverpass(lat, lng, raioMetros, categorias);
  let json: any;
  try {
    json = await comFallback(query);
  } catch (e) {
    // Sem rede/servidor fora: devolve o que estiver guardado (mesmo
    // vencido) em vez de deixar o publicador na mão no meio da rua.
    if (cached) return { pois: cached.data, deCache: true };
    throw e;
  }

  const vistos = new Set<string>();
  const pois: POI[] = [];
  for (const e of json.elements ?? []) {
    // way/relation vem com `center` (por causa do `out center`); node
    // vem com lat/lon direto. Sem coordenada não vira pino.
    const pLat = e.lat ?? e.center?.lat;
    const pLng = e.lon ?? e.center?.lon;
    if (typeof pLat !== 'number' || typeof pLng !== 'number') continue;
    const id = `${e.type}/${e.id}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    const cat = detectarCategoria(e.tags) ?? categorias[0] ?? 'parking';
    pois.push({
      id,
      lat: pLat,
      lng: pLng,
      nome: e.tags?.name || categoriaLabel(cat),
      categoria: cat
    });
  }

  const ordenados = ordenarPorDistancia(pois, { lat, lng });
  cache.set(chave, { ts: Date.now(), data: ordenados });
  return { pois: ordenados, deCache: false };
}

/**
 * Busca POIs por perto, já ordenados do mais perto pro mais longe.
 * Se o raio pedido não achar NADA, tenta uma vez com o dobro (teto de
 * 2km): o centro é a média das quadras e num território comprido ele
 * cai no meio do nada — dava "nenhum estacionamento" com estacionamento
 * a 900m.
 */
export async function buscarPOIs(
  lat: number,
  lng: number,
  raioMetros: number,
  categorias: CategoriaPOI[]
): Promise<ResultadoPOIs> {
  const r1 = await buscarPOIsUmRaio(lat, lng, raioMetros, categorias);
  if (r1.pois.length > 0 || raioMetros >= 2000) {
    return { pois: r1.pois, raioUsado: raioMetros, ampliado: false, deCache: r1.deCache };
  }
  const raioMaior = Math.min(raioMetros * 2, 2000);
  const r2 = await buscarPOIsUmRaio(lat, lng, raioMaior, categorias);
  return {
    pois: r2.pois,
    raioUsado: raioMaior,
    ampliado: r2.pois.length > 0,
    deCache: r2.deCache
  };
}

function detectarCategoria(tags: any): CategoriaPOI | null {
  if (!tags) return null;
  if (tags.amenity === 'parking') return 'parking';
  if (tags.amenity === 'pharmacy') return 'pharmacy';
  if (tags.amenity === 'fuel') return 'fuel';
  if (tags.shop === 'supermarket') return 'supermarket';
  if (tags.shop === 'bakery') return 'bakery';
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.place === 'square') return 'square';
  if (tags.amenity === 'bank') return 'bank';
  if (tags.amenity === 'school') return 'school';
  if (tags.amenity === 'place_of_worship') return 'church';
  if (tags.amenity === 'hospital' || tags.amenity === 'clinic') return 'hospital';
  return null;
}

export function categoriaLabel(c: CategoriaPOI): string {
  return {
    parking: 'Estacionamento',
    pharmacy: 'Farmácia',
    square: 'Praça',
    fuel: 'Posto',
    supermarket: 'Mercado',
    bakery: 'Padaria',
    bank: 'Banco',
    school: 'Escola',
    church: 'Igreja',
    hospital: 'Hospital'
  }[c];
}

// Nome do ícone lucide (ver $lib/ui/Icon.svelte) — zero emoji no app.
const ICONE_POR_CATEGORIA = {
  parking: 'parking',
  pharmacy: 'pill',
  square: 'trees',
  fuel: 'fuel',
  supermarket: 'cart',
  bakery: 'croissant',
  bank: 'banco',
  school: 'escola',
  church: 'igreja',
  hospital: 'hospital'
} as const;

export function categoriaIcone(c: CategoriaPOI): (typeof ICONE_POR_CATEGORIA)[CategoriaPOI] {
  return ICONE_POR_CATEGORIA[c];
}

// Gera URL do Google Maps pra navegação até um ponto.
export function urlRotaGoogleMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// === Vias com nome (Cartão S-12) ===
//
// Por que buscar isso em vez de confiar no rótulo de rua do próprio
// basemap: a camada de nome de rua do style (OpenFreeMap) só aparece a
// partir de um certo zoom E o texto vem pequeno — tentamos ajustar isso
// (setLayerZoomRange/text-size) e não resolveu de verdade: a geometria
// da rua às vezes nem está presente no tile naquele zoom (simplificação
// do próprio tileset, fora do nosso controle), e o posicionamento do
// texto sofre colisão com outras camadas do style. Buscando a via
// (geometria + nome) direto da Overpass e desenhando NÓS MESMOS como
// camada símbolo própria, o texto sempre aparece (garante-se
// allow-overlap), no tamanho que a gente escolhe, sem depender do que o
// tileset de terceiro decidiu incluir naquele zoom.

export interface ViaComNome {
  nome: string | null; // null = via sem nome (entra só no DESENHO, não no rótulo)
  pontos: [number, number][]; // [lng, lat], na ordem da via
}

export interface BBoxGraus {
  south: number;
  west: number;
  north: number;
  east: number;
}

// bbox em graus (sul, oeste, norte, leste) — mesmo formato que a Overpass usa.
// Devolve TODAS as vias "de carro" (com e sem nome), UMA entrada por way,
// SEM dedup por nome: o cartão desenha o traçado de todas (corredor
// branco por cima do preenchimento das quadras) e rotula cada TRECHO com
// nome — a dedup antiga de "um rótulo por nome" deixava rua sem nome
// entre quadras (queixa real: "entre a quadra B e C não apareceu a rua");
// quem controla repetição agora é a colisão do MapLibre no cartão.
export async function buscarViasComNome(bbox: BBoxGraus): Promise<ViaComNome[]> {
  // `out geom` traz a geometria completa inline pra CADA way (evita um
  // segundo passo de resolver nós). Caminho de pedestre/trilha/ciclovia
  // fica fora — no cartão de território eles viram ruído.
  const query =
    `[out:json][timeout:8];` +
    `way["highway"]["highway"!~"^(footway|path|steps|cycleway|track|corridor|bridleway|platform|construction|proposed)$"]` +
    `(${bbox.south},${bbox.west},${bbox.north},${bbox.east});out geom 800;`;
  const json = await comFallback(query);

  const vias: ViaComNome[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== 'way') continue;
    const geom = el.geometry;
    if (!Array.isArray(geom) || geom.length < 2) continue;
    const pontos: [number, number][] = geom
      .filter((g: any) => typeof g?.lat === 'number' && typeof g?.lon === 'number')
      .map((g: any) => [g.lon, g.lat] as [number, number]);
    if (pontos.length < 2) continue;
    vias.push({ nome: el.tags?.name ?? null, pontos });
  }
  return vias;
}

// Comprimento aproximado (metros) de uma polilinha [lng,lat] —
// equiretangular local, suficiente pra decidir se um trecho de rua é
// longo o bastante pra merecer rótulo. Puro e exportado pra teste.
export function comprimentoMetros(pontos: [number, number][]): number {
  if (pontos.length < 2) return 0;
  const cosLat = Math.cos((pontos[0][1] * Math.PI) / 180);
  let total = 0;
  for (let i = 1; i < pontos.length; i++) {
    const dx = (pontos[i][0] - pontos[i - 1][0]) * cosLat;
    const dy = pontos[i][1] - pontos[i - 1][1];
    total += Math.hypot(dx, dy);
  }
  return total * 111320; // 1 grau ≈ 111.32 km
}

// Ponto de ancoragem + ângulo do rótulo de uma via, pro texto ser
// desenhado como SÍMBOLO DE PONTO rotacionado (não de linha):
// `symbol-placement: line/line-center` do MapLibre só renderiza o texto
// se ele COUBER no comprimento da linha na tela — no zoom de um
// território inteiro, um trecho de rua tem ~80px e um nome tem ~300px,
// então NADA aparecia (text-allow-overlap não desliga essa checagem, só
// a colisão entre símbolos). Ponto rotacionado não tem essa regra.
// Anche: o ponto no MEIO do caminho (por distância acumulada, não o
// vértice do meio) e o ângulo do segmento onde ele cai, normalizado pra
// nunca ficar de cabeça pra baixo. Puro e exportado pra teste.
export function pontoDoRotulo(
  pontos: [number, number][],
  frac = 0.5
): { lng: number; lat: number; angulo: number } | null {
  if (pontos.length < 2) return null;
  // Equiretangular local: bom o bastante pra ângulo/distância de rua.
  const cosLat = Math.cos((pontos[0][1] * Math.PI) / 180);
  const dist = (a: [number, number], b: [number, number]) =>
    Math.hypot((b[0] - a[0]) * cosLat, b[1] - a[1]);
  let total = 0;
  for (let i = 1; i < pontos.length; i++) total += dist(pontos[i - 1], pontos[i]);
  if (total === 0) return null;
  let acc = 0;
  // frac = fração do comprimento (default 0.5 = meio): a colocação de
  // rótulos do cartão tenta VÁRIOS pontos ao longo da via, não só o meio.
  const alvo = total * Math.min(Math.max(frac, 0.02), 0.98);
  for (let i = 1; i < pontos.length; i++) {
    const d = dist(pontos[i - 1], pontos[i]);
    if (acc + d >= alvo && d > 0) {
      const t = (alvo - acc) / d;
      const lng = pontos[i - 1][0] + (pontos[i][0] - pontos[i - 1][0]) * t;
      const lat = pontos[i - 1][1] + (pontos[i][1] - pontos[i - 1][1]) * t;
      // Ângulo em graus HORÁRIOS a partir da horizontal da tela (y da
      // tela cresce pra baixo, daí o -dLat). text-rotate é horário.
      let angulo =
        (Math.atan2(-(pontos[i][1] - pontos[i - 1][1]), (pontos[i][0] - pontos[i - 1][0]) * cosLat) * 180) /
        Math.PI;
      // Nunca de cabeça pra baixo: normaliza pra (-90, 90]
      angulo = ((((angulo + 90) % 180) + 180) % 180) - 90;
      return { lng, lat, angulo };
    }
    acc += d;
  }
  return null;
}

// "Rua Pastor Josebias Fialho Marinho" não cabe no cartão — o cartão do
// app antigo abreviava ("R. Pastor Josebias...") e é o padrão de
// qualquer mapa impresso. Só o TIPO do logradouro (prefixo), o nome em
// si fica inteiro.
export function abreviarLogradouro(nome: string): string {
  return nome
    .replace(/^Rua\s/i, 'R. ')
    .replace(/^Avenida\s/i, 'Av. ')
    .replace(/^Travessa\s/i, 'Tv. ')
    .replace(/^Rodovia\s/i, 'Rod. ')
    .replace(/^Alameda\s/i, 'Al. ')
    .replace(/^Estrada\s/i, 'Est. ')
    .replace(/^Praça\s/i, 'Pç. ');
}
