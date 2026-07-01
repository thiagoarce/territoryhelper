import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarPredios, carregarPredioDetalhado } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const predios = await listarPredios(locals.supabase);

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

  return { predios, arranjosCartas, quadrasAtivas };
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
