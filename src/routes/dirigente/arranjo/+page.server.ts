import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { selectAll, listarPublicadores } from '$lib/server/queries';

export interface ArranjoLinha {
  id: number;
  tipo: string;
  status: string;
  data_encontro: string | null;
  hora_encontro: string | null;
  ponto_encontro_endereco: string | null;
  ponto_encontro_lat: number | null;
  ponto_encontro_lng: number | null;
  dirigente_id: string | null;
  notas: string | null;
  publicador_id: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return { arranjos: [], dirigenteNomes: {}, publicadores: [], quadrasPorArranjo: {}, participantesPorArranjo: {}, podeCoordenar: false };

  const podeCoordenar = ['dirigente', 'admin', 'super_admin'].includes(locals.profile?.role ?? '');

  const arranjos = await selectAll<ArranjoLinha>(
    locals.supabase
      .from('designacoes')
      .select('id, tipo, status, data_encontro, hora_encontro, ponto_encontro_endereco, ponto_encontro_lat, ponto_encontro_lng, dirigente_id, notas, publicador_id')
      .eq('tipo', 'arranjo')
      .in('status', ['aberta', 'concluida'])
      .order('data_encontro', { ascending: true })
  );

  const arranjoIds = arranjos.map((a) => a.id);

  const quadrasPorArranjo: Record<number, string[]> = {};
  const participantesPorArranjo: Record<number, { id: string; nome: string; papel: string }[]> = {};

  if (arranjoIds.length > 0) {
    const [linhasQuadras, linhasPubs] = await Promise.all([
      locals.supabase.from('designacao_quadras').select('designacao_id, quadra_id').in('designacao_id', arranjoIds),
      locals.supabase.from('designacao_publicadores').select('designacao_id, publicador_id, papel, profiles(nome)').in('designacao_id', arranjoIds)
    ]);
    for (const l of linhasQuadras.data ?? []) {
      const arr = quadrasPorArranjo[l.designacao_id] ?? [];
      arr.push(l.quadra_id);
      quadrasPorArranjo[l.designacao_id] = arr;
    }
    for (const l of (linhasPubs.data ?? []) as any[]) {
      const arr = participantesPorArranjo[l.designacao_id] ?? [];
      arr.push({ id: l.publicador_id, nome: l.profiles?.nome ?? '?', papel: l.papel });
      participantesPorArranjo[l.designacao_id] = arr;
    }
  }

  const dirigenteIds = [...new Set(arranjos.map((a) => a.dirigente_id).filter(Boolean) as string[])];
  const dirigenteNomes: Record<string, string> = {};
  if (dirigenteIds.length > 0) {
    const { data: profs } = await locals.supabase.from('profiles').select('id, nome').in('id', dirigenteIds);
    for (const p of profs ?? []) dirigenteNomes[p.id] = p.nome;
  }

  const publicadores = podeCoordenar ? await listarPublicadores(locals.supabase) : [];

  return {
    arranjos, dirigenteNomes, publicadores,
    quadrasPorArranjo, participantesPorArranjo,
    podeCoordenar,
    minhaId: locals.user.id
  };
};

export const actions: Actions = {
  criarArranjo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const quadras = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const participantes = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);
    const dataEncontro = String(fd.get('data_encontro') ?? '').trim() || null;
    const horaEncontro = String(fd.get('hora_encontro') ?? '').trim() || null;
    const ponto = String(fd.get('ponto_encontro_endereco') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (quadras.length === 0) return fail(400, { erro: 'Selecione quadras' });

    const { data: des, error } = await locals.supabase
      .from('designacoes')
      .insert({
        tipo: 'arranjo',
        status: 'aberta',
        criado_por: locals.user.id,
        dirigente_id: locals.user.id,
        publicador_id: participantes[0] ?? locals.user.id,
        data_encontro: dataEncontro,
        hora_encontro: horaEncontro,
        ponto_encontro_endereco: ponto,
        notas
      })
      .select('id')
      .single();
    if (error) return fail(400, { erro: error.message });

    if (quadras.length > 0) {
      await locals.supabase.from('designacao_quadras').insert(
        quadras.map((qid) => ({ designacao_id: des.id, quadra_id: qid }))
      );
    }
    if (participantes.length > 0) {
      await locals.supabase.from('designacao_publicadores').insert(
        participantes.map((pid, i) => ({
          designacao_id: des.id,
          publicador_id: pid,
          papel: i === 0 ? 'lider' : 'participante'
        }))
      );
    }
    return { ok: true, msg: 'Arranjo criado' };
  },

  concluir: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('designacoes').update({ status: 'concluida' }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Concluído' };
  }
};
