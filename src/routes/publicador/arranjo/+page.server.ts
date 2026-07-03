import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { selectAll, listarPublicadores, listarQuadrasComGeo } from '$lib/server/queries';
import type { QuadraGeo } from '$lib/server/queries';
import type { ArranjoBase } from '$lib/arranjos';

export interface ArranjoLinha extends ArranjoBase {}

export interface TpPontoLite {
  id: number;
  nome: string;
  endereco: string | null;
}

export interface TpTurnoLinha {
  id: number;
  ponto_id: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  vagas: number;
  ativo: boolean;
}

export interface TpEscalaLinha {
  turno_id: number;
  data: string;
  publicador_id: string;
}

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
    publicadores: [], partes: [] as ParteLinha[], nomesPorId: {} as Record<string, string>,
    tcesMap: {} as Record<string, string>, quadrasGeo: [] as QuadraGeo[], minhaId: '', podeCoordenar: false,
    tpTurnos: [] as TpTurnoLinha[], tpPontos: {} as Record<number, TpPontoLite>, tpEscala: [] as TpEscalaLinha[]
  };

  const podeCoordenar = ['dirigente', 'admin'].includes(locals.profile?.role ?? '');

  const escalaAte = new Date(Date.now() + 370 * 86400000).toISOString().slice(0, 10);
  const escalaDesde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [arranjos, modalidades, { data: profs }, publicadores, partesRes, tpTurnosRes, tpPontosRes, tpEscalaRes] = await Promise.all([
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
    podeCoordenar ? listarPublicadores(locals.supabase) : Promise.resolve([]),
    // Partes dos arranjos (RLS: publicador vê as dele; dirigente/admin veem todas)
    locals.supabase
      .from('arranjo_partes')
      .select('id, arranjo_id, quadras_ids, locais_ids, publicadores, notas')
      .order('criada_em'),
    // Turnos de TP recorrentes — intercalados na Agenda (spec TP2)
    locals.supabase.from('tp_turnos').select('*').eq('ativo', true),
    locals.supabase.from('tp_pontos').select('id, nome, endereco').eq('ativo', true),
    selectAll<TpEscalaLinha>(
      locals.supabase.from('tp_escala').select('turno_id, data, publicador_id')
        .gte('data', escalaDesde).lte('data', escalaAte)
    )
  ]);

  const tpTurnos = (tpTurnosRes.data ?? []) as TpTurnoLinha[];
  const tpPontos: Record<number, TpPontoLite> = {};
  for (const p of (tpPontosRes.data ?? []) as any[]) tpPontos[p.id] = { id: p.id, nome: p.nome, endereco: p.endereco };
  const tpEscala = (tpEscalaRes ?? []) as TpEscalaLinha[];

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

  // Geometria das quadras referenciadas pelos arranjos — pro mini-mapa do
  // sheet Repartir (só dirigente/admin usam; poupa payload do publicador)
  let quadrasGeo: QuadraGeo[] = [];
  if (podeCoordenar) {
    const idsUsados = new Set(arranjos.flatMap((a) => a.quadras_ids ?? []));
    if (idsUsados.size > 0) {
      const todas = await listarQuadrasComGeo(locals.supabase);
      quadrasGeo = todas.filter((q) => idsUsados.has(q.id));
    }
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
    arranjos, modalidades, dirigentes, prediosMap, publicadores, partes, nomesPorId, tcesMap, quadrasGeo,
    minhaId: locals.user.id, podeCoordenar, tpTurnos, tpPontos, tpEscala
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

  // Reparte o território do arranjo: cria uma PARTE (subconjunto de
  // quadras/prédios → 1+ publicadores; dupla/trio compartilham a mesma
  // parte). Substitui o antigo distribuirQuadras — não cria designações.
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
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });
    if (publicadorIds.length === 0) return fail(400, { erro: 'Selecione ao menos um publicador' });
    if (quadrasIds.length === 0 && locaisIds.length === 0) {
      return fail(400, { erro: 'Selecione ao menos uma quadra ou prédio' });
    }

    const ehAdmin = locals.profile?.role === 'admin';
    const { data: arr, error: errA } = await locals.supabase
      .from('arranjos')
      .select('id, nome, quadras_ids, cartas_locais_ids, dirigente_id')
      .eq('id', arranjoId).single();
    if (errA || !arr) return fail(400, { erro: 'Arranjo não encontrado' });
    if (!ehAdmin && arr.dirigente_id !== locals.user.id) {
      return fail(403, { erro: 'Você não é o dirigente desse arranjo' });
    }

    // Parte tem que ser subconjunto do território do arranjo
    const quadrasArr = new Set((arr.quadras_ids ?? []) as string[]);
    const locaisArr = new Set((arr.cartas_locais_ids ?? []) as number[]);
    const foraQ = quadrasIds.filter((q) => !quadrasArr.has(q));
    const foraL = locaisIds.filter((l) => !locaisArr.has(l));
    if (foraQ.length > 0 || foraL.length > 0) {
      return fail(400, { erro: 'Itens fora do território do arranjo: ' + [...foraQ, ...foraL].join(', ') });
    }

    const { error } = await locals.supabase.from('arranjo_partes').insert({
      arranjo_id: arranjoId,
      quadras_ids: quadrasIds,
      locais_ids: locaisIds,
      publicadores: publicadorIds,
      notas,
      criado_por: locals.user.id
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `Parte criada pra ${publicadorIds.length} publicador(es)` };
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
  },

  apagarParte: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });

    // Dirigente só apaga partes de arranjos dele
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

  // Inscrição antecipada — sinal de interesse, não cria parte automaticamente.
  // Qualquer publicador autenticado pode se marcar/desmarcar. RLS de arranjos
  // é admin-only pra UPDATE, então isso passa pela RPC security definer
  // (migration 035) que só mexe no próprio uid dentro de interessados.
  toggleInteresse: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });

    const { data, error } = await locals.supabase
      .rpc('toggle_interesse_arranjo', { p_arranjo_id: arranjoId });
    if (error) return fail(400, { erro: error.message });
    const interessado = !!data;
    return { ok: true, msg: interessado ? 'Interesse registrado' : 'Interesse removido', interessado };
  },

  // Inscrição em turno de TP numa data concreta. Vaga validada na ACTION
  // (count < vagas), não em constraint — corrida aceitável nesse volume.
  inscreverTurno: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const turnoId = Number(fd.get('turno_id') ?? 0);
    const dataOc = String(fd.get('data') ?? '').trim();
    if (!turnoId || !dataOc) return fail(400, { erro: 'turno_id e data obrigatórios' });

    const { data: turno, error: errT } = await locals.supabase
      .from('tp_turnos').select('vagas, ativo').eq('id', turnoId).single();
    if (errT || !turno) return fail(404, { erro: 'Turno não encontrado' });
    if (!turno.ativo) return fail(400, { erro: 'Esse turno não está mais ativo' });

    const { count } = await locals.supabase
      .from('tp_escala').select('id', { count: 'exact', head: true })
      .eq('turno_id', turnoId).eq('data', dataOc);
    if ((count ?? 0) >= turno.vagas) return fail(409, { erro: 'Turno sem vagas nessa data' });

    const { error } = await locals.supabase
      .from('tp_escala').insert({ turno_id: turnoId, data: dataOc, publicador_id: locals.user.id });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Inscrito no turno' };
  },

  sairTurno: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const turnoId = Number(fd.get('turno_id') ?? 0);
    const dataOc = String(fd.get('data') ?? '').trim();
    if (!turnoId || !dataOc) return fail(400, { erro: 'turno_id e data obrigatórios' });
    const { error } = await locals.supabase
      .from('tp_escala').delete()
      .eq('turno_id', turnoId).eq('data', dataOc).eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Saiu do turno' };
  }
};
