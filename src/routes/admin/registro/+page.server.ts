import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarQuadrasComGeo, listarDesignacoes } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [quadras, designacoes] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase)
  ]);
  const alocadas = new Set<string>();
  for (const d of designacoes) {
    if (d.status === 'aberta') for (const q of d.quadras_ids) alocadas.add(q);
  }
  return { quadras, quadrasAlocadas: [...alocadas] };
};

export const actions: Actions = {
  marcarConcluidas: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    const data = String(fd.get('data') ?? '').trim() || new Date().toISOString().substring(0, 10);
    // modo: 'normal' (detecta conflito) | 'substituir' (troca a mais recente) | 'historico' (só adiciona)
    const modo = String(fd.get('modo') ?? 'normal');
    if (ids.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });

    // Em modo 'normal' — detecta se a data sendo marcada é ANTERIOR à mais recente
    // no histórico de alguma das quadras selecionadas. Se sim, devolve conflito
    // pra UI pedir confirmação (erro / substituir / só histórico).
    if (modo === 'normal') {
      const { data: hist } = await locals.supabase
        .from('quadras_conclusoes')
        .select('quadra_id, data_conclusao')
        .in('quadra_id', ids)
        .order('data_conclusao', { ascending: false });
      const ultimaPorQuadra = new Map<string, string>();
      for (const h of hist ?? []) {
        if (!ultimaPorQuadra.has(h.quadra_id)) ultimaPorQuadra.set(h.quadra_id, h.data_conclusao);
      }
      const conflitos = ids.filter((qid) => {
        const ult = ultimaPorQuadra.get(qid);
        return ult && ult > data;
      });
      if (conflitos.length > 0) {
        return {
          ok: false,
          conflito: true,
          ids: conflitos,
          data,
          ultimas: conflitos.map((qid) => ({ id: qid, ultima: ultimaPorQuadra.get(qid)! }))
        };
      }
    }

    // 0. SELF-HEAL: pra cada quadra com data_conclusao atual mas SEM histórico,
    //    cria entrada de backfill primeiro. Cobre dados vindos do CSV onde a
    //    user não rodou o insert manual de quadras_conclusoes.
    const { data: estado } = await locals.supabase
      .from('quadras')
      .select('id, data_conclusao')
      .in('id', ids)
      .not('data_conclusao', 'is', null);
    if (estado && estado.length > 0) {
      const { data: jaTemHist } = await locals.supabase
        .from('quadras_conclusoes')
        .select('quadra_id')
        .in('quadra_id', estado.map((q) => q.id));
      const idsComHist = new Set((jaTemHist ?? []).map((h) => h.quadra_id));
      const backfill = estado
        .filter((q) => !idsComHist.has(q.id))
        .map((q) => ({ quadra_id: q.id, data_conclusao: q.data_conclusao }));
      if (backfill.length > 0) {
        await locals.supabase.from('quadras_conclusoes').insert(backfill);
      }
    }

    // Modo 'substituir' — remove a entrada mais recente do histórico de cada quadra
    if (modo === 'substituir') {
      for (const qid of ids) {
        const { data: ult } = await locals.supabase
          .from('quadras_conclusoes')
          .select('id')
          .eq('quadra_id', qid)
          .order('data_conclusao', { ascending: false })
          .order('id', { ascending: false })
          .limit(1);
        if (ult && ult[0]) {
          await locals.supabase.from('quadras_conclusoes').delete().eq('id', ult[0].id);
        }
      }
    }

    // 1. Loga no histórico (uma linha por quadra)
    const linhas = ids.map((qid) => ({
      quadra_id: qid,
      data_conclusao: data,
      marcado_por: locals.user!.id
    }));
    await locals.supabase.from('quadras_conclusoes').insert(linhas);

    // 2. Atualiza quadras — quadra.data_conclusao recebe a MAIOR data do histórico
    //    (em modo 'historico' isso garante que adicionar uma data antiga não derruba a atual)
    for (const qid of ids) {
      const { data: max } = await locals.supabase
        .from('quadras_conclusoes')
        .select('data_conclusao')
        .eq('quadra_id', qid)
        .order('data_conclusao', { ascending: false })
        .limit(1);
      const maiorData = max?.[0]?.data_conclusao ?? data;
      await locals.supabase
        .from('quadras')
        .update({ status: 'concluido', data_conclusao: maiorData })
        .eq('id', qid);
    }

    // Fechar designações cujas quadras estão TODAS concluídas
    const { data: dqLinhas } = await locals.supabase
      .from('designacao_quadras')
      .select('designacao_id, quadra_id')
      .in('quadra_id', ids);
    const designacoesIds = [...new Set((dqLinhas ?? []).map((l) => l.designacao_id))];
    for (const dId of designacoesIds) {
      const { data: todasLinhas } = await locals.supabase
        .from('designacao_quadras')
        .select('quadra_id, quadras(status)')
        .eq('designacao_id', dId);
      const todasConcluidas = (todasLinhas ?? []).every((l: any) => l.quadras?.status === 'concluido');
      if (todasConcluidas && (todasLinhas?.length ?? 0) > 0) {
        await locals.supabase.from('designacoes').update({ status: 'concluida' }).eq('id', dId);
      }
    }

    return { ok: true, msg: `${ids.length} quadra(s) marcada(s) como concluída(s)` };
  },

  // Reverter restaura a PENÚLTIMA conclusão. Se não houver penúltima
  // (só 1 ou 0 entradas no histórico), NÃO apaga — só avisa.
  // Nunca destrói dado sem ter alternativa pra mostrar.
  reverter: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    if (ids.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });

    let revertidas = 0;
    let semHistorico = 0;
    for (const qid of ids) {
      const { data: hist } = await locals.supabase
        .from('quadras_conclusoes')
        .select('id, data_conclusao')
        .eq('quadra_id', qid)
        .order('data_conclusao', { ascending: false })
        .order('id', { ascending: false })
        .limit(2);

      // Só reverte se houver penúltima — caso contrário deixa como está
      if (!hist || hist.length < 2) {
        semHistorico++;
        continue;
      }

      // Remove a última (atual) e restaura a penúltima
      await locals.supabase.from('quadras_conclusoes').delete().eq('id', hist[0].id);
      await locals.supabase
        .from('quadras')
        .update({ status: 'concluido', data_conclusao: hist[1].data_conclusao })
        .eq('id', qid);
      revertidas++;
    }

    let msg = '';
    if (revertidas > 0) msg += `${revertidas} revertida(s)`;
    if (semHistorico > 0) {
      if (msg) msg += '. ';
      msg += `${semHistorico} sem conclusão anterior (não revertida — long-press pra ver histórico)`;
    }
    return { ok: true, msg };
  },

  // Limpar conclusão (botão explícito, destrutivo) — apaga TODO o histórico e data
  limparConclusao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    if (ids.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });
    await locals.supabase.from('quadras_conclusoes').delete().in('quadra_id', ids);
    const { error } = await locals.supabase
      .from('quadras')
      .update({ status: 'pendente', data_conclusao: null })
      .in('id', ids);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${ids.length} limpa(s) (histórico apagado)` };
  },

  // Histórico de conclusões de uma quadra (pro long-press / detalhe)
  historico: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { data, error } = await locals.supabase
      .from('quadras_conclusoes')
      .select('id, data_conclusao, marcado_em, marcado_por, profiles(nome)')
      .eq('quadra_id', id)
      .order('data_conclusao', { ascending: false })
      .order('id', { ascending: false })
      .limit(20);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, historico: data };
  }
};
