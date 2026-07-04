import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { exigirAdmin } from '../_shared';

export interface TpPonto {
  id: number;
  nome: string;
  endereco: string | null;
  notas: string | null;
  ativo: boolean;
  lat: number | null;
  lng: number | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const { data: pontosRes } = await locals.supabase
    .from('tp_pontos_geo')
    .select('id, nome, endereco, notas, ativo, geo_geojson')
    .order('nome');

  const pontos: TpPonto[] = ((pontosRes ?? []) as any[]).map((p) => ({
    id: p.id,
    nome: p.nome,
    endereco: p.endereco,
    notas: p.notas,
    ativo: p.ativo,
    lat: p.geo_geojson?.coordinates?.[1] ?? null,
    lng: p.geo_geojson?.coordinates?.[0] ?? null
  }));

  return { pontos };
};

export const actions: Actions = {
  criarPonto: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const endereco = String(fd.get('endereco') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const lat = parseFloat(String(fd.get('lat') ?? ''));
    const lng = parseFloat(String(fd.get('lng') ?? ''));
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const geo = isFinite(lat) && isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : null;
    const { error } = await locals.supabase.from('tp_pontos').insert({ nome, endereco, notas, geo });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Ponto criado' };
  },

  atualizarPonto: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const nome = String(fd.get('nome') ?? '').trim();
    const endereco = String(fd.get('endereco') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true';
    const lat = parseFloat(String(fd.get('lat') ?? ''));
    const lng = parseFloat(String(fd.get('lng') ?? ''));
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const geo = isFinite(lat) && isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : null;
    const { error } = await locals.supabase
      .from('tp_pontos').update({ nome, endereco, notas, ativo, geo }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Ponto atualizado' };
  },

  apagarPonto: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_pontos').delete().eq('id', id);
    if (error) return fail(400, { erro: 'Esse ponto tem agendamento(s) vinculado(s) — desative-o em vez de excluir, ou troque o ponto dos agendamentos primeiro.' });
    return { ok: true, msg: 'Ponto removido' };
  }
};
