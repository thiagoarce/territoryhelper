import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { selectAll } from '$lib/server/queries';
import type { ArranjoBase } from '$lib/arranjos';

export interface ArranjoLinha extends ArranjoBase {}

export interface ModalidadeLite {
  id: number;
  nome: string;
  tipo_territorio: string;
  cor: string;
}

export interface PredioChip {
  id: number;
  logradouro: string | null;
  numero: string | null;
  nome: string | null;
  qtd_aptos: number;
  qtd_entregues: number;
}

export interface ParteLinha {
  id: number;
  arranjo_id: number;
  quadras_ids: string[];
  locais_ids: number[];
  publicadores: string[];
  notas: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return {
    arranjos: [], modalidades: [], dirigentes: {}, prediosMap: {} as Record<number, PredioChip>,
    partes: [] as ParteLinha[], nomesPorId: {} as Record<string, string>,
    tcesMap: {} as Record<string, string>, minhaId: '', podeCoordenar: false
  };

  const podeCoordenar = ['dirigente', 'admin'].includes(locals.profile?.role ?? '');

  const [arranjos, modalidades, { data: profs }, partesRes] = await Promise.all([
    selectAll<ArranjoLinha>(
      locals.supabase
        .from('arranjos')
        .select('*')
        .eq('ativo', true)
        .order('dia_semana', { nullsFirst: false })
        .order('hora_inicio', { nullsFirst: false })
    ),
    selectAll<ModalidadeLite>(
      locals.supabase.from('arranjo_modalidades').select('id, nome, tipo_territorio, cor')
    ),
    // Todos os profiles pra resolver nomes (dirigentes E membros de partes)
    locals.supabase.from('profiles').select('id, nome, role'),
    // Partes dos arranjos (RLS: publicador vê as dele; dirigente/admin veem todas)
    locals.supabase
      .from('arranjo_partes')
      .select('id, arranjo_id, quadras_ids, locais_ids, publicadores, notas')
      .order('criada_em')
  ]);

  const dirigentes: Record<string, string> = {};
  const nomesPorId: Record<string, string> = {};
  for (const p of profs ?? []) {
    nomesPorId[p.id] = p.nome;
    if (p.role === 'dirigente' || p.role === 'admin') dirigentes[p.id] = p.nome;
  }

  const partes = (partesRes.data ?? []) as ParteLinha[];

  // Nomes de TCEs referenciados (arranjo misto)
  const tceIds = Array.from(new Set(arranjos.map((a: any) => a.tce_id).filter(Boolean)));
  const tcesMap: Record<string, string> = {};
  if (tceIds.length > 0) {
    const { data: tces } = await locals.supabase.from('tces').select('id, nome').in('id', tceIds);
    for (const t of (tces ?? []) as any[]) tcesMap[t.id] = t.nome;
  }

  // Coleta ids únicos de prédios referenciados nos arranjos e busca detalhes + stats
  const predioIds = Array.from(
    new Set(arranjos.flatMap((a) => a.cartas_locais_ids ?? []).filter((n) => Number.isFinite(n)))
  );
  const prediosMap: Record<number, PredioChip> = {};
  if (predioIds.length > 0) {
    const [locaisRes, unidsRes] = await Promise.all([
      locals.supabase.from('locais').select('id, logradouro, numero, nome').in('id', predioIds),
      selectAll<{ local_id: number; carta_entregue: string | null }>(
        locals.supabase.from('unidades').select('local_id, carta_entregue').in('local_id', predioIds)
      )
    ]);
    const stats: Record<number, { qtd: number; ent: number }> = {};
    for (const u of unidsRes) {
      const s = (stats[u.local_id] ||= { qtd: 0, ent: 0 });
      s.qtd++;
      if (u.carta_entregue) s.ent++;
    }
    for (const l of (locaisRes.data ?? []) as any[]) {
      const s = stats[l.id] ?? { qtd: 0, ent: 0 };
      prediosMap[l.id] = {
        id: l.id,
        logradouro: l.logradouro,
        numero: l.numero,
        nome: l.nome,
        qtd_aptos: s.qtd,
        qtd_entregues: s.ent
      };
    }
  }

  return {
    arranjos, modalidades, dirigentes, prediosMap, partes, nomesPorId, tcesMap,
    minhaId: locals.user.id, podeCoordenar
  };
};

export const actions: Actions = {
  // Assume dirigência de um arranjo aberto (specs Fase 3 — só dirigente/admin)
  assumirArranjo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin pode assumir arranjo' });
    }
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });

    const { data: arr, error: errA } = await locals.supabase
      .from('arranjos').select('id, nome, dirigente_id').eq('id', arranjoId).single();
    if (errA || !arr) return fail(404, { erro: 'Arranjo não encontrado' });
    if (arr.dirigente_id === locals.user.id) return fail(400, { erro: 'Você já é o dirigente' });

    const { error: errUp } = await locals.supabase
      .from('arranjos').update({ dirigente_id: locals.user.id }).eq('id', arranjoId);
    if (errUp) return fail(400, { erro: errUp.message });

    if (arr.nome && arr.dirigente_id) {
      await locals.supabase
        .from('designacoes')
        .update({ dirigente_id: locals.user.id })
        .eq('status', 'aberta')
        .eq('dirigente_id', arr.dirigente_id)
        .ilike('notas', `%${arr.nome}%`);
    }
    return { ok: true, msg: `Você é o novo dirigente de "${arr.nome ?? 'arranjo'}"` };
  },

  // Gera link público /t/<token> do arranjo (pra WhatsApp — quem não abre o app)
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
  }
};
