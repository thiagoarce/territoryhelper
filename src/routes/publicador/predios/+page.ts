// W9: load UNIVERSAL no BROWSER (ssr=false) com cache offline — mesma
// receita W3/W4/W5/W8. GPS (lat/lng) não entra na chave de cache: o
// cache serve a lista base sem sinal, a ordenação por proximidade é só
// um bônus quando há GPS+rede.
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { listarPredios, listarPublicadores, selectAll } from '$lib/queries';
import type { PredioListado } from '$lib/queries';
import { comCache } from '$lib/offline/cache-leitura';

export const ssr = false;

export type PredioCampo = PredioListado & { distancia_m?: number };

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180, Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function chavePrediosCampo(userId: string): string {
  return `campo:predios:${userId}`;
}

export const load: PageLoad = async ({ parent, url }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');

  const q = (url.searchParams.get('q') || '').trim();
  const lat = parseFloat(url.searchParams.get('lat') || '');
  const lng = parseFloat(url.searchParams.get('lng') || '');
  const temGeo = isFinite(lat) && isFinite(lng);
  const podeCoordenar = ['dirigente', 'admin'].includes(profile.role ?? '');

  const r = await comCache(chavePrediosCampo(profile.id), () => carregarPrediosCampo(podeCoordenar));

  let enriched: PredioCampo[] = r.valor.predios;
  if (temGeo) {
    const supabase = supabaseBrowser();
    const geoRows = await selectAll<{ id: number; geo_geojson: any }>(
      supabase.from('locais_geo').select('id, geo_geojson').in('tipo', ['predio', 'comercio'])
    );
    const geoById = new Map<number, [number, number]>();
    for (const g of geoRows) {
      const coords = g.geo_geojson?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) geoById.set(g.id, [coords[1], coords[0]]);
    }
    enriched = r.valor.predios.map((p) => {
      const c = geoById.get(p.id);
      if (!c) return { ...p, distancia_m: undefined };
      return { ...p, distancia_m: haversine(lat, lng, c[0], c[1]) };
    });
    enriched.sort((a, b) => (a.distancia_m ?? Infinity) - (b.distancia_m ?? Infinity));
  }

  return {
    predios: enriched,
    publicadores: r.valor.publicadores,
    q,
    lat: temGeo ? lat : null,
    lng: temGeo ? lng : null,
    podeCoordenar,
    cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm }
  };
};

// Exportada pra ser reusada pelo prefetch da carteira (campo-fetchers.ts)
// — MESMA função, MESMA chave de cache, senão o prefetch não serve pra nada.
export async function carregarPrediosCampo(podeCoordenar: boolean) {
  const supabase = supabaseBrowser();
  const [predios, publicadores] = await Promise.all([
    listarPredios(supabase),
    podeCoordenar ? listarPublicadores(supabase) : Promise.resolve([])
  ]);
  return { predios, publicadores };
}
