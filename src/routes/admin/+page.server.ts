import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarQuadrasComGeo, listarDesignacoes, listarPublicadores } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [quadras, designacoes, publicadores] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase),
    listarPublicadores(locals.supabase)
  ]);
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  const quadrasAlocadas = new Set<string>();
  for (const d of abertas) for (const q of d.quadras_ids) quadrasAlocadas.add(q);

  return {
    quadras,
    designacoesAbertas: abertas,
    publicadores,
    quadrasAlocadas: [...quadrasAlocadas]
  };
};

export const actions: Actions = {
  // Criar designação direto da Geral (multi-seleção → publicador + prazo)
  criarDesignacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const publicadorId = String(fd.get('publicador_id') ?? '');
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!publicadorId || quadrasIds.length === 0) return fail(400, { erro: 'publicador + quadras obrigatórios' });

    const { data: des, error: errD } = await locals.supabase
      .from('designacoes')
      .insert({ publicador_id: publicadorId, prazo, notas, status: 'aberta', criado_por: locals.user.id })
      .select('id')
      .single();
    if (errD) return fail(400, { erro: errD.message });

    const linhas = quadrasIds.map((qid) => ({ designacao_id: des.id, quadra_id: qid }));
    const { error: errJ } = await locals.supabase.from('designacao_quadras').insert(linhas);
    if (errJ) return fail(400, { erro: 'Designação criada mas falhou ao vincular: ' + errJ.message });
    return { ok: true, msg: `Designação criada com ${quadrasIds.length} quadra(s)` };
  }
};
