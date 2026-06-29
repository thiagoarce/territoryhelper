import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import {
  listarDesignacoes,
  listarPublicadores,
  listarQuadrasComContagem
} from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [designacoes, publicadores, quadras] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarPublicadores(locals.supabase),
    listarQuadrasComContagem(locals.supabase)
  ]);
  return { designacoes, publicadores, quadras };
};

export const actions: Actions = {
  // Cria nova designação + junção com quadras. Tudo numa transação implícita
  // via 2 queries — não usamos rpc pra simplicidade. Em caso de erro entre
  // elas, fica designação sem quadras (admin pode deletar e refazer).
  criar: async ({ request, locals }) => {
    const fd = await request.formData();
    const publicadorId = String(fd.get('publicador_id') ?? '');
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;

    if (!publicadorId) return fail(400, { erro: 'Escolha um publicador' });
    if (quadrasIds.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });

    const { data: des, error: errDes } = await locals.supabase
      .from('designacoes')
      .insert({ publicador_id: publicadorId, prazo, notas, status: 'aberta' })
      .select('id')
      .single();
    if (errDes) return fail(400, { erro: errDes.message });

    const linhasJuncao = quadrasIds.map((qid) => ({ designacao_id: des.id, quadra_id: qid }));
    const { error: errJoin } = await locals.supabase
      .from('designacao_quadras')
      .insert(linhasJuncao);
    if (errJoin) return fail(400, { erro: 'Designação criada mas falhou ao vincular quadras: ' + errJoin.message });

    return { ok: true, msg: `Designação criada (${quadrasIds.length} quadra(s))` };
  },

  // Atualiza publicador / prazo / notas / quadras de uma designação existente.
  // Pra reatribuir designações antigas (importadas com publicador NULL).
  atualizar: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const publicadorId = String(fd.get('publicador_id') ?? '').trim() || null;
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);

    const { error: errUp } = await locals.supabase
      .from('designacoes')
      .update({ publicador_id: publicadorId, prazo, notas })
      .eq('id', id);
    if (errUp) return fail(400, { erro: errUp.message });

    // Atualiza junção: deleta tudo + insere de novo (atomicidade não crítica aqui)
    if (quadrasIds.length > 0) {
      await locals.supabase.from('designacao_quadras').delete().eq('designacao_id', id);
      const linhas = quadrasIds.map((qid) => ({ designacao_id: id, quadra_id: qid }));
      const { error: errIns } = await locals.supabase.from('designacao_quadras').insert(linhas);
      if (errIns) return fail(400, { erro: 'Quadras: ' + errIns.message });
    }
    return { ok: true, msg: 'Atualizada' };
  },

  // Muda status da designação (concluir / cancelar / reabrir)
  mudarStatus: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const status = String(fd.get('status') ?? '');
    if (!id || !['aberta', 'concluida', 'cancelada'].includes(status)) {
      return fail(400, { erro: 'Parâmetros inválidos' });
    }
    const { error } = await locals.supabase
      .from('designacoes')
      .update({ status })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Status atualizado' };
  },

  // Exclui designação (cascade limpa as junções com quadras)
  excluir: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('designacoes').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Excluída' };
  }
};
