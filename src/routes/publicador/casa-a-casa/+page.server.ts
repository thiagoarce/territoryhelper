// W4: o LOAD desta rota mora em +page.ts (universal, roda no BROWSER
// com ssr=false) — leituras direto browser→Supabase via RLS. Este
// arquivo fica só com as ACTIONS (guards de role/dirigência intactos).
import type { Actions } from './$types';
import { hojeIsoBrasil } from '$lib/utils/data';
import { fail } from '@sveltejs/kit';
import { criarNotificacao } from '$lib/server/push';

export const actions: Actions = {
  // A2: sheet de ação da quadra em "Seu grupo" — mesma lógica de
  // publicador/quadra/[id]?/concluirQuadra, mas parametrizada por quadra_id
  // (esta página não é escopada a uma quadra na URL).
  concluirQuadraGrupo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin pode marcar conclusão' });
    }
    const fd = await request.formData();
    const quadraId = String(fd.get('quadra_id') ?? '');
    if (!quadraId) return fail(400, { erro: 'quadra_id obrigatório' });
    const data = String(fd.get('data') ?? '').trim() || hojeIsoBrasil();
    const { error: err } = await locals.supabase
      .from('quadras')
      .update({ data_conclusao: data })
      .eq('id', quadraId);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Quadra concluída em ' + data };
  },

  // Link público /t/<token> do arranjo (WhatsApp c/ mapa) — migrou de
  // /publicador/arranjo junto com o resto das ações de "seu grupo".
  gerarLinkTerritorio: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });
    const { data, error } = await locals.supabase
      .from('territorio_tokens')
      .insert({ arranjo_id: arranjoId, criado_por: locals.user.id })
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, token: data.token };
  },

  // Reparte o território do arranjo: cria uma PARTE (subconjunto de
  // quadras/prédios → 1+ publicadores; dupla/trio compartilham a mesma
  // parte). Migrou de /publicador/arranjo pra cá (fica junto do mapa que
  // ele edita).
  criarParte: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin pode repartir' });
    }
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    const publicadorIds = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const locaisIds = fd.getAll('locais_ids').map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
    const tcesIds = fd.getAll('tces_ids').map((v) => String(v)).filter(Boolean);
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });
    if (publicadorIds.length === 0) return fail(400, { erro: 'Selecione ao menos um publicador' });
    if (quadrasIds.length === 0 && locaisIds.length === 0 && tcesIds.length === 0) {
      return fail(400, { erro: 'Selecione ao menos uma quadra, prédio ou TCE' });
    }

    const ehAdmin = locals.profile?.role === 'admin';
    const { data: arr, error: errA } = await locals.supabase
      .from('arranjos')
      .select('id, nome, quadras_ids, cartas_locais_ids, tces_ids, dirigente_id')
      .eq('id', arranjoId).single();
    if (errA || !arr) return fail(400, { erro: 'Arranjo não encontrado' });
    if (!ehAdmin && arr.dirigente_id !== locals.user.id) {
      return fail(403, { erro: 'Você não é o dirigente desse arranjo' });
    }

    const quadrasArr = new Set((arr.quadras_ids ?? []) as string[]);
    const locaisArr = new Set((arr.cartas_locais_ids ?? []) as number[]);
    const tcesArr = new Set((arr.tces_ids ?? []) as string[]);
    const foraQ = quadrasIds.filter((q) => !quadrasArr.has(q));
    const foraL = locaisIds.filter((l) => !locaisArr.has(l));
    const foraT = tcesIds.filter((t) => !tcesArr.has(t));
    if (foraQ.length > 0 || foraL.length > 0 || foraT.length > 0) {
      return fail(400, { erro: 'Itens fora do território do arranjo: ' + [...foraQ, ...foraL, ...foraT].join(', ') });
    }

    const { error } = await locals.supabase.from('arranjo_partes').insert({
      arranjo_id: arranjoId,
      quadras_ids: quadrasIds,
      locais_ids: locaisIds,
      tces_ids: tcesIds,
      publicadores: publicadorIds,
      notas,
      criado_por: locals.user.id
    });
    if (error) return fail(400, { erro: error.message });

    await criarNotificacao(publicadorIds, {
      titulo: 'Você recebeu uma parte do território',
      corpo: arr.nome ?? 'Pregação em grupo',
      url: '/publicador/casa-a-casa'
    });

    return { ok: true, msg: `Parte criada pra ${publicadorIds.length} publicador(es)` };
  },

  apagarParte: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });

    if (locals.profile?.role !== 'admin') {
      const { data: pt } = await locals.supabase
        .from('arranjo_partes')
        .select('id, arranjos!inner(dirigente_id)')
        .eq('id', id)
        .maybeSingle();
      if (!pt || (pt as any).arranjos?.dirigente_id !== locals.user.id) {
        return fail(403, { erro: 'Essa parte não é de um arranjo seu' });
      }
    }

    const { error } = await locals.supabase.from('arranjo_partes').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Parte removida' };
  },

  // Finaliza a designação de um arranjo que já passou: marca ativo=false
  // e apaga as partes daquele arranjo (encerra o acesso de quem tinha
  // parte lá). Toda ação do dirigente mora aqui em Casa a casa — home só
  // avisa e linka pra cá.
  finalizarArranjo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });

    const { data: arr, error: errA } = await locals.supabase
      .from('arranjos').select('id, dirigente_id').eq('id', arranjoId).single();
    if (errA || !arr) return fail(404, { erro: 'Arranjo não encontrado' });
    if (locals.profile?.role !== 'admin' && arr.dirigente_id !== locals.user.id) {
      return fail(403, { erro: 'Você não é o dirigente desse arranjo' });
    }

    const { error: errUp } = await locals.supabase.from('arranjos').update({ ativo: false }).eq('id', arranjoId);
    if (errUp) return fail(400, { erro: errUp.message });
    await locals.supabase.from('arranjo_partes').delete().eq('arranjo_id', arranjoId);

    return { ok: true, msg: 'Designação finalizada' };
  }
};
