// Helper pra Overpass API (OSM) — busca POIs perto de um centro.
// Free, sem chave, mas tem rate limit. Cache simples in-memory.

export type CategoriaPOI = 'parking' | 'pharmacy' | 'square' | 'fuel' | 'supermarket' | 'bakery';

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
  bakery: ['["shop"="bakery"]']
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
  // `out center 60`: way não tem lat/lon próprio — `center` manda o
  // centroide; 60 limita o tamanho da resposta. `timeout:8` MENOR que o
  // abort do fetch (13s) de propósito: o servidor desiste antes do
  // client, então resposta lenta-mas-viva ainda chega em vez de ser
  // abortada no meio.
  return `[out:json][timeout:8];(${blocos});out center 60;`;
}

// O overpass-api.de (instância pública principal) vive sobrecarregado e
// devolve 504 "server too busy" — visto ao vivo no diagnóstico deste
// bug, inclusive pra query trivial. Fallback em cadeia: tenta o próximo
// espelho quando um falha, e LEMBRA qual funcionou pra começar por ele
// na próxima busca da sessão. Todos mandam Access-Control-Allow-Origin:*
// (verificado — o fetch roda no browser, sem CORS nada funciona).
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
let endpointBomIdx = 0;

async function postOverpass(endpoint: string, query: string): Promise<any> {
  // Timeout no fetch em si (o `[timeout:8]` da query só limita a
  // execução DENTRO do servidor — conexão travada precisa de abort).
  // 13s > 8s da query: dá tempo da resposta lenta chegar inteira.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 13000);
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: ctrl.signal
    });
    if (!resp.ok) throw new Error('Overpass falhou: ' + resp.status);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// Cadeia de fallback compartilhada por qualquer chamador (POIs, vias) —
// tenta cada espelho, lembra qual funcionou pra começar por ele na
// próxima chamada da sessão (endpointBomIdx é módulo, compartilhado).
async function comFallback(query: string): Promise<any> {
  let ultimoErro: unknown = null;
  for (let i = 0; i < ENDPOINTS.length; i++) {
    const idx = (endpointBomIdx + i) % ENDPOINTS.length;
    try {
      const json = await postOverpass(ENDPOINTS[idx], query);
      endpointBomIdx = idx;
      return json;
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw ultimoErro ?? new Error('Overpass indisponível');
}

const cache = new Map<string, { ts: number; data: POI[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function buscarPOIs(
  lat: number,
  lng: number,
  raioMetros: number,
  categorias: CategoriaPOI[]
): Promise<POI[]> {
  const chave = `${lat.toFixed(4)},${lng.toFixed(4)},${raioMetros},${[...categorias].sort().join(',')}`;
  const cached = cache.get(chave);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const query = montarQueryOverpass(lat, lng, raioMetros, categorias);
  const json = await comFallback(query);

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
    pois.push({
      id,
      lat: pLat,
      lng: pLng,
      nome: e.tags?.name || categoriaLabel(detectarCategoria(e.tags) ?? 'parking'),
      categoria: detectarCategoria(e.tags) ?? 'parking'
    });
  }

  cache.set(chave, { ts: Date.now(), data: pois });
  return pois;
}

function detectarCategoria(tags: any): CategoriaPOI | null {
  if (!tags) return null;
  if (tags.amenity === 'parking') return 'parking';
  if (tags.amenity === 'pharmacy') return 'pharmacy';
  if (tags.amenity === 'fuel') return 'fuel';
  if (tags.shop === 'supermarket') return 'supermarket';
  if (tags.shop === 'bakery') return 'bakery';
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.place === 'square') return 'square';
  return null;
}

export function categoriaLabel(c: CategoriaPOI): string {
  return {
    parking: 'Estacionamento',
    pharmacy: 'Farmácia',
    square: 'Praça',
    fuel: 'Posto',
    supermarket: 'Mercado',
    bakery: 'Padaria'
  }[c];
}

// Nome do ícone lucide (ver $lib/ui/Icon.svelte) — zero emoji no app.
const ICONE_POR_CATEGORIA = {
  parking: 'parking',
  pharmacy: 'pill',
  square: 'trees',
  fuel: 'fuel',
  supermarket: 'cart',
  bakery: 'croissant'
} as const;

export function categoriaIcone(c: CategoriaPOI): 'parking' | 'pill' | 'trees' | 'fuel' | 'cart' | 'croissant' {
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
  nome: string;
  pontos: [number, number][]; // [lng, lat], na ordem da via
}

// bbox em graus (sul, oeste, norte, leste) — mesmo formato que a Overpass usa.
export async function buscarViasComNome(bbox: {
  south: number;
  west: number;
  north: number;
  east: number;
}): Promise<ViaComNome[]> {
  // `out geom` traz a geometria completa inline pra CADA way (evita um
  // segundo passo de resolver nós) — suficiente pra desenhar a linha e
  // ancorar o texto, sem pedir nó por nó.
  const query = `[out:json][timeout:8];way["highway"]["name"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out geom;`;
  const json = await comFallback(query);

  // Uma rua real quase sempre vira VÁRIOS ways no OSM (um por quadra/
  // trecho) — sem deduplicar, o mesmo nome se repetiria várias vezes
  // muito perto uma da outra, poluindo o cartão. Fica só o trecho mais
  // longo (mais pontos, proxy simples de comprimento) de cada nome.
  const porNome = new Map<string, ViaComNome>();
  for (const el of json.elements ?? []) {
    if (el.type !== 'way') continue;
    const nome = el.tags?.name;
    const geom = el.geometry;
    if (!nome || !Array.isArray(geom) || geom.length < 2) continue;
    const pontos: [number, number][] = geom
      .filter((g: any) => typeof g?.lat === 'number' && typeof g?.lon === 'number')
      .map((g: any) => [g.lon, g.lat] as [number, number]);
    if (pontos.length < 2) continue;
    const atual = porNome.get(nome);
    if (!atual || pontos.length > atual.pontos.length) porNome.set(nome, { nome, pontos });
  }
  return [...porNome.values()];
}
