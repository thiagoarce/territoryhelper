import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarPredios, listarPublicadores, selectAll } from '$lib/server/queries';
import type { PredioListado } from '$lib/server/queries';

export type PredioCampo = PredioListado & { distancia_m?: number };

// Haversine simples pra ordenação por proximidade (sem depender de PostGIS)
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // metros
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180, Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Reusa listarPredios (mesma fonte de /admin/predios). Se GPS ativo,
// carrega geo de TODOS os prédios e ordena por distância haversine.
export const load: PageServerLoad = async ({ locals, url }) => {
  const q = (url.searchParams.get('q') || '').trim();
  const lat = parseFloat(url.searchParams.get('lat') || '');
  const lng = parseFloat(url.searchParams.get('lng') || '');
  const temGeo = isFinite(lat) && isFinite(lng);

  const podeCoordenar = ['dirigente', 'admin'].includes(locals.profile?.role ?? '');

  const [predios, geoRows, publicadores] = await Promise.all([
    listarPredios(locals.supabase),
    temGeo
      ? selectAll<{ id: number; geo_geojson: any }>(
          locals.supabase
            .from('locais_geo')
            .select('id, geo_geojson')
            .in('tipo', ['predio', 'comercio'])
        )
      : Promise.resolve([] as { id: number; geo_geojson: any }[]),
    podeCoordenar ? listarPublicadores(locals.supabase) : Promise.resolve([])
  ]);

  // Se tem GPS, calcula distância haversine pra cada prédio com geo
  let enriched: PredioCampo[] = predios as PredioCampo[];
  if (temGeo && geoRows.length > 0) {
    const geoById = new Map<number, [number, number]>(); // [lat, lng]
    for (const g of geoRows) {
      const coords = g.geo_geojson?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        // GeoJSON é [lng, lat]
        geoById.set(g.id, [coords[1], coords[0]]);
      }
    }
    enriched = predios.map((p) => {
      const c = geoById.get(p.id);
      if (!c) return { ...p, distancia_m: undefined };
      return { ...p, distancia_m: haversine(lat, lng, c[0], c[1]) };
    });
    enriched.sort((a, b) => {
      const da = a.distancia_m ?? Number.POSITIVE_INFINITY;
      const db = b.distancia_m ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }

  return {
    predios: enriched,
    q,
    lat: temGeo ? lat : null,
    lng: temGeo ? lng : null,
    publicadores,
    podeCoordenar
  };
};

export const actions: Actions = {
  // Cria prédio pendente (mesma lógica de /buscar)
  criarPredioPendente: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const logradouro = String(fd.get('logradouro') ?? '').trim();
    const numero = String(fd.get('numero') ?? '').trim() || 's/n';
    const nome = String(fd.get('nome') ?? '').trim() || null;
    const tipoEntrada = String(fd.get('tipo_entrada') ?? '').trim() || null;
    const qtd = Number(fd.get('qtd_aptos') ?? 0);
    const lat = parseFloat(String(fd.get('lat') ?? ''));
    const lng = parseFloat(String(fd.get('lng') ?? ''));
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!logradouro) return fail(400, { erro: 'Logradouro obrigatório' });

    const geo = isFinite(lat) && isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : null;

    const { data: novo, error: errL } = await locals.supabase
      .from('locais')
      .insert({
        tipo: 'predio',
        logradouro, numero, nome, tipo_entrada: tipoEntrada,
        geo, quadra_id: null, pendente: true, notas,
        criado_por: locals.user.id
      })
      .select('id')
      .single();
    if (errL || !novo) return fail(400, { erro: errL?.message ?? 'Falhou' });

    const n = Number.isFinite(qtd) && qtd > 0 ? Math.min(qtd, 200) : 1;
    const unidades = Array.from({ length: n }, (_, i) => ({
      local_id: novo.id,
      complemento: `APTO ${i + 1}`,
      ordem: i + 1
    }));
    await locals.supabase.from('unidades').insert(unidades);
    return { ok: true, msg: 'Prédio criado — admin vai validar', id: novo.id };
  },

  // Designa prédios como território de cartas pra um ou mais publicadores.
  // Cria N designações (uma por publicador) com tipo='cartas' + linha em
  // designacao_locais pra cada prédio. Só dirigente/admin.
  designarCartas: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin pode designar' });
    }
    const fd = await request.formData();
    const publicadores = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);
    const prediosIds = fd.getAll('predio_ids').map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (publicadores.length === 0) return fail(400, { erro: 'Selecione ao menos um publicador' });
    if (prediosIds.length === 0) return fail(400, { erro: 'Selecione ao menos um prédio' });

    for (const pubId of publicadores) {
      const { data: des, error: errD } = await locals.supabase
        .from('designacoes')
        .insert({
          tipo: 'cartas',
          status: 'aberta',
          criado_por: locals.user.id,
          dirigente_id: locals.user.id,
          publicador_id: pubId,
          prazo,
          notas
        })
        .select('id').single();
      if (errD || !des) continue;
      await locals.supabase.from('designacao_locais').insert(
        prediosIds.map((lid) => ({ designacao_id: des.id, local_id: lid }))
      );
      // Também registra em designacao_publicadores (padrão do resto do schema)
      await locals.supabase
        .from('designacao_publicadores')
        .insert({ designacao_id: des.id, publicador_id: pubId, papel: 'lider' });
    }
    return { ok: true, msg: `Designado ${prediosIds.length} prédio(s) pra ${publicadores.length} publicador(es)` };
  },

  // Gera link público de cartas pro WhatsApp (mesma do admin)
  gerarLink: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { data, error } = await locals.supabase
      .from('cartas_tokens')
      .insert({ local_id: id, criado_por: locals.user.id })
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, token: data.token };
  }
};
