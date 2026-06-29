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
  // Admin designa direto da Geral. Dois tipos:
  // - 'pessoal' (default): território pessoal pra UM publicador trabalhar
  // - 'arranjo': delega pra um DIRIGENTE coordenar uma saída em grupo
  criarDesignacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const tipo = String(fd.get('tipo') ?? 'pessoal');
    const publicadorIds = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);
    const dirigenteId = String(fd.get('dirigente_id') ?? '').trim() || null;
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (quadrasIds.length === 0) return fail(400, { erro: 'quadras obrigatórias' });

    if (tipo === 'arranjo') {
      if (!dirigenteId) return fail(400, { erro: 'dirigente obrigatório pra arranjo' });
    } else {
      if (publicadorIds.length === 0) return fail(400, { erro: 'pelo menos 1 publicador obrigatório' });
    }

    const { data: des, error: errD } = await locals.supabase
      .from('designacoes')
      .insert({
        tipo,
        publicador_id: tipo === 'pessoal' ? publicadorIds[0] : null,
        dirigente_id: tipo === 'arranjo' ? dirigenteId : null,
        prazo,
        notas,
        status: 'aberta',
        criado_por: locals.user.id
      })
      .select('id')
      .single();
    if (errD) return fail(400, { erro: errD.message });

    const linhas = quadrasIds.map((qid) => ({ designacao_id: des.id, quadra_id: qid }));
    const { error: errJ } = await locals.supabase.from('designacao_quadras').insert(linhas);
    if (errJ) return fail(400, { erro: 'Designação criada mas falhou ao vincular: ' + errJ.message });

    // Participantes (somente pessoal): N publicadores. Pro arranjo, o dirigente convida
    if (tipo === 'pessoal' && publicadorIds.length > 0) {
      const part = publicadorIds.map((pid, i) => ({
        designacao_id: des.id,
        publicador_id: pid,
        papel: i === 0 ? 'lider' : 'participante'
      }));
      await locals.supabase.from('designacao_publicadores').insert(part);
    }
    const label = tipo === 'arranjo' ? 'Arranjo delegado ao dirigente' : `Designada a ${publicadorIds.length} publicador(es)`;
    return { ok: true, msg: `${label} com ${quadrasIds.length} quadra(s)` };
  },

  encerrarDesignacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('designacoes').update({ status: 'concluida' }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Encerrada' };
  }
};
