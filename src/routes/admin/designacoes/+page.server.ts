import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarDesignacoes, listarPublicadores } from '$lib/server/queries';
import type { DesignacaoEnriquecida } from '$lib/server/queries';

// Hub central de gestão de designações: pessoal, arranjo (distribuídas),
// cartas e TCE num lugar só. Antes cada tipo era gerido na tela onde nascia.

export interface DesignacaoHub extends DesignacaoEnriquecida {
  predios: { id: number; nome: string | null; logradouro: string; numero: string }[];
}

export interface TceHub {
  id: string;
  nome: string;
  tipo: string;
  publicador_id: string | null;
  publicador_nome: string | null;
  prazo: string | null;
  status: string;
  data_conclusao: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const [designacoes, publicadores, tceRes, dlRes] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarPublicadores(locals.supabase),
    locals.supabase
      .from('tces')
      .select('id, nome, tipo, publicador_id, prazo, status, data_conclusao')
      .order('status')
      .order('prazo', { nullsFirst: false }),
    locals.supabase.from('designacao_locais').select('designacao_id, local_id')
  ]);

  // Resolve prédios das designações de cartas (uma query pros locais referenciados)
  const localIds = Array.from(new Set((dlRes.data ?? []).map((r: any) => r.local_id)));
  const locaisById = new Map<number, { id: number; nome: string | null; logradouro: string; numero: string }>();
  if (localIds.length > 0) {
    const { data: locs } = await locals.supabase
      .from('locais').select('id, nome, logradouro, numero').in('id', localIds);
    for (const l of (locs ?? []) as any[]) locaisById.set(l.id, l);
  }
  const prediosPorDesig: Record<number, any[]> = {};
  for (const r of (dlRes.data ?? []) as any[]) {
    const l = locaisById.get(r.local_id);
    if (l) (prediosPorDesig[r.designacao_id] ||= []).push(l);
  }

  const nomePorId = new Map(publicadores.map((p) => [p.id, p.nome]));
  const hub: DesignacaoHub[] = designacoes.map((d) => ({
    ...d,
    predios: prediosPorDesig[d.id] ?? []
  }));

  const tces: TceHub[] = ((tceRes.data ?? []) as any[]).map((t) => ({
    ...t,
    publicador_nome: t.publicador_id ? nomePorId.get(t.publicador_id) ?? null : null
  }));

  return { designacoes: hub, tces, publicadores };
};

function exigirAdmin(locals: App.Locals) {
  if (!locals.user) return fail(401, { erro: 'Não autenticado' });
  if (locals.profile?.role !== 'admin') return fail(403, { erro: 'Só admin' });
  return null;
}

export const actions: Actions = {
  // Muda status (concluida / cancelada / aberta) — cobre concluir, cancelar e reabrir
  mudarStatus: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const status = String(fd.get('status') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    if (!['aberta', 'concluida', 'cancelada'].includes(status)) return fail(400, { erro: 'status inválido' });
    const { error } = await locals.supabase.from('designacoes').update({ status }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `Designação ${status}` };
  },

  // Edita publicador / prazo / notas de uma designação
  editar: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const publicadorId = String(fd.get('publicador_id') ?? '').trim() || null;
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const { error } = await locals.supabase
      .from('designacoes')
      .update({ publicador_id: publicadorId, prazo, notas })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Designação atualizada' };
  },

  // Apaga a designação (cascade limpa junções). Libera as quadras/prédios.
  apagar: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('designacoes').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Designação removida' };
  },

  // Gera link público /t/<token> da designação (WhatsApp pra quem não abre o app)
  gerarLinkTerritorio: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const designacaoId = Number(fd.get('designacao_id') ?? 0);
    if (!designacaoId) return fail(400, { erro: 'designacao_id obrigatório' });
    const { data, error } = await locals.supabase
      .from('territorio_tokens')
      .insert({ designacao_id: designacaoId, criado_por: locals.user!.id })
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, token: data.token };
  },

  // Status de TCE (aberto / concluido / cancelado)
  mudarStatusTce: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const status = String(fd.get('status') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    if (!['aberto', 'concluido', 'cancelado'].includes(status)) return fail(400, { erro: 'status inválido' });
    const patch: any = { status };
    if (status === 'concluido') patch.data_conclusao = new Date().toISOString().substring(0, 10);
    if (status === 'aberto') patch.data_conclusao = null;
    const { error } = await locals.supabase.from('tces').update(patch).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `TCE ${status}` };
  }
};
