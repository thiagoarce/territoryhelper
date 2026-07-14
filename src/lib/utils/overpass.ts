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

  let json: any = null;
  let ultimoErro: unknown = null;
  for (let i = 0; i < ENDPOINTS.length; i++) {
    const idx = (endpointBomIdx + i) % ENDPOINTS.length;
    try {
      json = await postOverpass(ENDPOINTS[idx], query);
      endpointBomIdx = idx;
      break;
    } catch (e) {
      ultimoErro = e;
    }
  }
  if (json === null) throw ultimoErro ?? new Error('Overpass indisponível');

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
