import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarDesignacoes, listarQuadrasComGeo, listarPublicadores, type QuadraGeo } from '$lib/server/queries';
import { criarNotificacao } from '$lib/server/push';

export interface ArranjoQueDirijo {
  id: number;
  nome: string;
  quadras_ids: string[];
  cartas_locais_ids: number[];
  interessados: string[];
}

export interface ParteLinha {
  id: number;
  arranjo_id: number;
  arranjo_nome: string;
  quadras_ids: string[];
  locais_ids: number[];
  publicadores: string[];
  notas: string | null;
}

export interface MinhaParte {
  id: number;
  arranjo_nome: string;
  colegas: string[];
  quadras_ids: string[];
  locais_ids: number[];
}

// Navegação: aba dedicada de "casa em casa" — mapa com GPS pra identificar
// qual quadra é qual dentro do território designado agora. Três seções
// possíveis: (1) "seu grupo" — mapa do arranjo INTEIRO que você dirige +
// repartir território (migrou de /publicador/arranjo pra cá — o botão de
// repartir fica junto do mapa que ele edita); (2) "sua parte" — mapa só
// do subconjunto que te cabe (dupla/trio); (3) território pessoal.
export const load: PageServerLoad = async ({ locals }) => {
  const ontem = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
  const podeCoordenar = ['dirigente', 'admin'].includes(locals.profile?.role ?? '');

  const [designacoes, quadras, partesMinhasRes, dirijoRes, profRes] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarQuadrasComGeo(locals.supabase),
    locals.supabase
      .from('arranjo_partes')
      .select('id, arranjo_id, quadras_ids, locais_ids, publicadores, arranjos!inner(nome, ativo)')
      .contains('publicadores', [locals.user!.id])
      .eq('arranjos.ativo', true),
    locals.supabase
      .from('arranjos')
      .select('id, nome, quadras_ids, cartas_locais_ids, interessados')
      .eq('ativo', true)
      .eq('dirigente_id', locals.user!.id)
      .or(`data.gte.${ontem},data.is.null`),
    locals.supabase.from('profiles').select('id, nome')
  ]);

  const nomesPorId = new Map((profRes.data ?? []).map((p: any) => [p.id, p.nome as string]));
  const quadrasMap = new Map(quadras.map((q) => [q.id, q]));

  const arranjosQueDirijo: ArranjoQueDirijo[] = ((dirijoRes.data ?? []) as any[]).map((a) => ({
    id: a.id,
    nome: a.nome ?? 'Arranjo',
    quadras_ids: (a.quadras_ids ?? []) as string[],
    cartas_locais_ids: (a.cartas_locais_ids ?? []) as number[],
    interessados: (a.interessados ?? []) as string[]
  }));

  const minhasPartes: MinhaParte[] = ((partesMinhasRes.data ?? []) as any[]).map((p) => ({
    id: p.id,
    arranjo_nome: p.arranjos?.nome ?? 'Arranjo',
    colegas: (p.publicadores as string[]).filter((id) => id !== locals.user!.id).map((id) => nomesPorId.get(id) ?? '?'),
    quadras_ids: (p.quadras_ids ?? []) as string[],
    locais_ids: (p.locais_ids ?? []) as number[]
  }));

  // Todas as partes JÁ CRIADAS dos arranjos que dirijo — pra lista "Partes
  // criadas" + saber o que já foi repartido (evitar sobrepor sem avisar).
  let partesDosMeusArranjos: ParteLinha[] = [];
  let publicadoresParaRepartir: { id: string; nome: string; role: string }[] = [];
  if (podeCoordenar && arranjosQueDirijo.length > 0) {
    const idsArranjos = arranjosQueDirijo.map((a) => a.id);
    const [{ data: todasPartes }, pubs] = await Promise.all([
      locals.supabase
        .from('arranjo_partes')
        .select('id, arranjo_id, quadras_ids, locais_ids, publicadores, notas')
        .in('arranjo_id', idsArranjos)
        .order('criada_em'),
      listarPublicadores(locals.supabase)
    ]);
    const nomePorArranjo = new Map(arranjosQueDirijo.map((a) => [a.id, a.nome]));
    partesDosMeusArranjos = ((todasPartes ?? []) as any[]).map((p) => ({
      id: p.id,
      arranjo_id: p.arranjo_id,
      arranjo_nome: nomePorArranjo.get(p.arranjo_id) ?? 'Arranjo',
      quadras_ids: (p.quadras_ids ?? []) as string[],
      locais_ids: (p.locais_ids ?? []) as number[],
      publicadores: (p.publicadores ?? []) as string[],
      notas: p.notas ?? null
    }));
    publicadoresParaRepartir = pubs;
  }

  // Território pessoal (designação individual, não é grupo) — pra 3ª seção.
  const minhasComoLider = designacoes.filter((d) => d.publicador_id === locals.user!.id && d.status === 'aberta' && d.tipo !== 'cartas');
  const idsPessoais = [...new Set(minhasComoLider.flatMap((d) => d.quadras_ids))];
  const territorioPessoal = idsPessoais.map((id) => quadrasMap.get(id)).filter(Boolean) as QuadraGeo[];

  const quadrasPorArranjo = (ids: string[]): QuadraGeo[] => ids.map((id) => quadrasMap.get(id)).filter(Boolean) as QuadraGeo[];

  return {
    arranjosQueDirijo: arranjosQueDirijo.map((a) => ({ ...a, quadrasGeo: quadrasPorArranjo(a.quadras_ids) })),
    minhasPartes: minhasPartes.map((p) => ({ ...p, quadrasGeo: quadrasPorArranjo(p.quadras_ids) })),
    partesDosMeusArranjos,
    publicadoresParaRepartir,
    nomesPorId: Object.fromEntries(nomesPorId),
    territorioPessoal,
    minhaId: locals.user!.id
  };
};

export const actions: Actions = {
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
  }
};
