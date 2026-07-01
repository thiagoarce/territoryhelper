// Helper pra Overpass API (OSM) — busca POIs perto de um centro.
// Free, sem chave, mas tem rate limit. Cache simples in-memory.

export type CategoriaPOI = 'parking' | 'pharmacy' | 'square' | 'fuel' | 'supermarket' | 'bakery';

interface POI {
  id: string;
  lat: number;
  lng: number;
  nome: string;
  categoria: CategoriaPOI;
}

const queryPorCategoria: Record<CategoriaPOI, string> = {
  parking: '["amenity"="parking"]',
  pharmacy: '["amenity"="pharmacy"]',
  square: '["leisure"="park"];node["leisure"="garden"];node["place"="square"]',
  fuel: '["amenity"="fuel"]',
  supermarket: '["shop"="supermarket"]',
  bakery: '["shop"="bakery"]'
};

const cache = new Map<string, { ts: number; data: POI[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function buscarPOIs(
  lat: number,
  lng: number,
  raioMetros: number,
  categorias: CategoriaPOI[]
): Promise<POI[]> {
  const chave = `${lat.toFixed(4)},${lng.toFixed(4)},${raioMetros},${categorias.sort().join(',')}`;
  const cached = cache.get(chave);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  // Monta query Overpass QL
  const blocos = categorias.map((c) => `node${queryPorCategoria[c]}(around:${raioMetros},${lat},${lng});`).join('');
  const query = `[out:json][timeout:10];(${blocos});out body;`;

  const url = 'https://overpass-api.de/api/interpreter';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query)
  });
  if (!resp.ok) throw new Error('Overpass falhou: ' + resp.status);
  const json: any = await resp.json();

  const pois: POI[] = (json.elements ?? []).map((e: any) => ({
    id: String(e.id),
    lat: e.lat,
    lng: e.lon,
    nome: e.tags?.name || categoriaLabel(detectarCategoria(e.tags) ?? 'parking'),
    categoria: detectarCategoria(e.tags) ?? 'parking'
  }));

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

export function categoriaEmoji(c: CategoriaPOI): string {
  return { parking: '🅿️', pharmacy: '💊', square: '🌳', fuel: '⛽', supermarket: '🛒', bakery: '🥐' }[c];
}

// Gera URL do Google Maps pra navegação até um ponto.
export function urlRotaGoogleMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
