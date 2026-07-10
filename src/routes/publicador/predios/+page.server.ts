// W9: load foi pro +page.ts (universal, browser). Aqui só ficam as
// actions — mutações continuam no Worker por defesa em profundidade.
import type { Actions } from './$types';
import { criarNotificacao } from '$lib/server/push';
import { fail } from '@sveltejs/kit';

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
    // Mesmo aviso que o fluxo do admin dispara — sem isso quem foi
    // designado pelo dirigente nunca ficava sabendo.
    await criarNotificacao(publicadores, {
      titulo: 'Você recebeu cartas designadas',
      corpo: `${prediosIds.length} prédio(s) pra trabalhar por carta`,
      url: '/publicador'
    });
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
