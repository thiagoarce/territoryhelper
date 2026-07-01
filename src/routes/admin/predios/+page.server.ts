import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarPredios, carregarPredioDetalhado, listarPublicadores, selectAll } from '$lib/server/queries';
import type { PredioListado } from '$lib/server/queries';

export type PredioAdmin = PredioListado & { distancia_m?: number };

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180, Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const lat = parseFloat(url.searchParams.get('lat') || '');
  const lng = parseFloat(url.searchParams.get('lng') || '');
  const temGeo = isFinite(lat) && isFinite(lng);

  const [predios, geoRows, publicadores] = await Promise.all([
    listarPredios(locals.supabase),
    temGeo
      ? selectAll<{ id: number; geo_geojson: any }>(
          locals.supabase.from('locais_geo').select('id, geo_geojson').in('tipo', ['predio', 'comercio'])
        )
      : Promise.resolve([] as { id: number; geo_geojson: any }[]),
    listarPublicadores(locals.supabase)
  ]);

  // Ordena por proximidade se GPS ativo
  let prediosOrd: PredioAdmin[] = predios as PredioAdmin[];
  if (temGeo && geoRows.length > 0) {
    const geoById = new Map<number, [number, number]>();
    for (const g of geoRows) {
      const coords = g.geo_geojson?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) geoById.set(g.id, [coords[1], coords[0]]);
    }
    prediosOrd = predios.map((p) => {
      const c = geoById.get(p.id);
      if (!c) return { ...p, distancia_m: undefined };
      return { ...p, distancia_m: haversine(lat, lng, c[0], c[1]) };
    });
    prediosOrd.sort((a, b) => {
      const da = a.distancia_m ?? Number.POSITIVE_INFINITY;
      const db = b.distancia_m ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }

  // Quadras ativas pra dropdown de validar prédio pendente
  const { data: quadrasRes } = await locals.supabase
    .from('quadras').select('id').eq('ativa', true).order('id');
  const quadrasAtivas = ((quadrasRes ?? []) as any[]).map((q) => q.id as string);

  // Arranjos do tipo 'cartas_lista' (pra anexar prédios via lista)
  const { data: mods } = await locals.supabase
    .from('arranjo_modalidades').select('id, nome, tipo_territorio, cor');
  const cartasIds = new Set((mods ?? []).filter((m: any) => m.tipo_territorio === 'cartas_lista').map((m: any) => m.id));
  const { data: arrRaw } = await locals.supabase
    .from('arranjos')
    .select('id, nome, modalidade_id, data, dia_semana, recorrente, cartas_locais_ids, hora_inicio, ativo')
    .eq('ativo', true)
    .order('data', { nullsFirst: false })
    .order('hora_inicio', { nullsFirst: false });
  const modById = new Map((mods ?? []).map((m: any) => [m.id, m]));
  const arranjosCartas = (arrRaw ?? [])
    .filter((a: any) => cartasIds.has(a.modalidade_id))
    .map((a: any) => ({
      ...a,
      modalidade_nome: modById.get(a.modalidade_id)?.nome ?? '?',
      modalidade_cor: modById.get(a.modalidade_id)?.cor ?? '#3b82f6'
    }));

  return { predios: prediosOrd, arranjosCartas, quadrasAtivas, publicadores, lat: temGeo ? lat : null, lng: temGeo ? lng : null };
};

export const actions: Actions = {
  // Carrega detalhes de UM prédio (pro modal inline)
  detalhe: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const p = await carregarPredioDetalhado(locals.supabase, id);
    if (!p) return fail(404, { erro: 'Prédio não encontrado' });
    return { ok: true, predio: p };
  },

  atualizar: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const permitidos = ['nome', 'irmao_mora', 'nome_irmao', 'notas', 'tipo_entrada', 'acesso_caixas', 'acesso_interfones', 'nao_visitar', 'nao_eh_predio'];
    const booleanos = new Set(['irmao_mora', 'acesso_caixas', 'acesso_interfones', 'nao_visitar', 'nao_eh_predio']);
    const patch: Record<string, unknown> = {};
    for (const k of permitidos) {
      if (k === 'nao_eh_predio') {
        // Sempre seta esse — vem com 'on' se marcado, ausente se desmarcado
        patch[k] = fd.get(k) === 'on';
        continue;
      }
      if (!fd.has(k)) continue;
      const v = fd.get(k);
      if (booleanos.has(k)) {
        patch[k] = v === 'on' || v === 'true';
      } else {
        const s = String(v ?? '').trim();
        patch[k] = s === '' ? null : s;
      }
    }

    // "Não é prédio" propaga pra todas as unidades do mesmo agrupamento (logradouro+numero)
    if ('nao_eh_predio' in patch) {
      const { data: base } = await locals.supabase.from('locais').select('logradouro, numero').eq('id', id).maybeSingle();
      if (base) {
        await locals.supabase
          .from('locais')
          .update({ nao_eh_predio: patch.nao_eh_predio })
          .eq('logradouro', base.logradouro)
          .eq('numero', base.numero);
      }
      delete patch.nao_eh_predio;
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await locals.supabase.from('locais').update(patch).eq('id', id);
      if (error) return fail(400, { erro: error.message });
    }
    return { ok: true, msg: 'Atualizado' };
  },

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
  },

  // Designa prédios como território de cartas pra um ou mais publicadores
  // (mesma lógica de /publicador/predios). Admin only.
  designarCartas: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
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
      await locals.supabase
        .from('designacao_publicadores')
        .insert({ designacao_id: des.id, publicador_id: pubId, papel: 'lider' });
    }
    return { ok: true, msg: `Designado ${prediosIds.length} prédio(s) pra ${publicadores.length} publicador(es)` };
  },

  // Valida prédio pendente: associa a uma quadra e marca pendente=false.
  // Admin only.
  validarPredio: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (locals.profile?.role !== 'admin') return fail(403, { erro: 'Só admin' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const quadraId = String(fd.get('quadra_id') ?? '').trim() || null;
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const patch: any = { pendente: false };
    if (quadraId) patch.quadra_id = quadraId;
    const { error } = await locals.supabase.from('locais').update(patch).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Prédio validado' };
  },

  // Anexa prédios selecionados a um arranjo de cartas (tipo 'cartas_lista').
  // Junta com os cartas_locais_ids existentes (ou substitui).
  adicionarPrediosAoArranjo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    const prediosIds = fd.getAll('predio_ids').map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
    const substituir = fd.get('substituir') === 'on' || fd.get('substituir') === 'true';
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });
    if (prediosIds.length === 0) return fail(400, { erro: 'Sem prédios selecionados' });

    const { data: arr, error: errR } = await locals.supabase
      .from('arranjos').select('cartas_locais_ids').eq('id', arranjoId).single();
    if (errR || !arr) return fail(400, { erro: 'Arranjo não encontrado' });

    const atuais = (arr.cartas_locais_ids ?? []) as number[];
    const novas = substituir ? prediosIds : Array.from(new Set([...atuais, ...prediosIds]));
    const { error } = await locals.supabase
      .from('arranjos').update({ cartas_locais_ids: novas }).eq('id', arranjoId);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${prediosIds.length} prédio(s) anexado(s)` };
  }
};
