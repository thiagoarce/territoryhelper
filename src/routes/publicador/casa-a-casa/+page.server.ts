import type { Actions, PageServerLoad } from './$types';
import { hojeIsoBrasil } from '$lib/utils/data';
import { fail } from '@sveltejs/kit';
import { listarDesignacoes, listarQuadrasComGeo, listarPublicadores, calcularCoberturaPorQuadra, type QuadraGeo, type CoberturaQuadra } from '$lib/server/queries';
import { criarNotificacao } from '$lib/server/push';
import { arranjoAindaVale, precisaFinalizar } from '$lib/arranjos';

export interface ArranjoQueDirijo {
  id: number;
  nome: string;
  data: string;
  quadras_ids: string[];
  cartas_locais_ids: number[];
  tces_ids: string[];
  interessados: string[];
}

export interface ParteLinha {
  id: number;
  arranjo_id: number;
  arranjo_nome: string;
  quadras_ids: string[];
  locais_ids: number[];
  tces_ids: string[];
  publicadores: string[];
  notas: string | null;
}

export interface MinhaParte {
  id: number;
  arranjo_nome: string;
  colegas: string[];
  quadras_ids: string[];
  locais_ids: number[];
  tces_ids: string[];
}

// Navegação: aba dedicada de "casa em casa" — mapa com GPS pra identificar
// qual quadra é qual dentro do território designado agora. Seções
// possíveis: (0) "finalize a designação" — arranjos que dirijo cujo dia
// já passou e ainda não fechei (toda AÇÃO do dirigente mora aqui, home
// só avisa e linka); (1) "seu grupo" — mapa do PRÓXIMO arranjo que
// dirijo (só o mais próximo, pra não encher a lista — os demais entram
// num indicativo "+N outras" com modal) + repartir território; (2) "sua
// parte" — mapa só do subconjunto que te cabe; (3) território pessoal.
export const load: PageServerLoad = async ({ locals }) => {
  const hoje = hojeIsoBrasil();
  const ontem = hojeIsoBrasil(-1);
  const ha60dias = hojeIsoBrasil(-60);
  const podeCoordenar = ['dirigente', 'admin'].includes(locals.profile?.role ?? '');

  const [designacoes, quadras, partesMinhasRes, dirijoRes, profRes] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarQuadrasComGeo(locals.supabase),
    locals.supabase
      .from('arranjo_partes')
      .select('id, arranjo_id, quadras_ids, locais_ids, tces_ids, publicadores, arranjos!inner(nome, ativo)')
      .contains('publicadores', [locals.user!.id])
      .eq('arranjos.ativo', true),
    // Sem filtro de data aqui — pego 60 dias pra trás pra achar pendências
    // de finalizar + futuros, e filtro os dois casos em JS abaixo.
    locals.supabase
      .from('arranjos')
      .select('id, nome, quadras_ids, cartas_locais_ids, tces_ids, interessados, recorrente, data, data_fim')
      .eq('ativo', true)
      .eq('dirigente_id', locals.user!.id)
      .or(`data.gte.${ha60dias},data.is.null,recorrente.eq.true`)
      .limit(50),
    locals.supabase.from('profiles').select('id, nome')
  ]);

  const nomesPorId = new Map((profRes.data ?? []).map((p: any) => [p.id, p.nome as string]));
  const quadrasMap = new Map(quadras.map((q) => [q.id, q]));
  const quadrasPorArranjo = (ids: string[]): QuadraGeo[] => ids.map((id) => quadrasMap.get(id)).filter(Boolean) as QuadraGeo[];

  const brutos = (dirijoRes.data ?? []) as any[];

  const arranjosQueDirijoOrdenados: ArranjoQueDirijo[] = brutos
    .filter((a) => arranjoAindaVale(a, ontem))
    .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))
    .map((a) => ({
      id: a.id,
      nome: a.nome ?? 'Arranjo',
      data: a.data as string,
      quadras_ids: (a.quadras_ids ?? []) as string[],
      cartas_locais_ids: (a.cartas_locais_ids ?? []) as number[],
      tces_ids: (a.tces_ids ?? []) as string[],
      interessados: (a.interessados ?? []) as string[]
    }));
  // Só o próximo aparece com mapa+repartir — o resto vira indicativo (evita
  // encher a tela quando o dirigente tem várias saídas na agenda).
  const arranjoQueDirijo = arranjosQueDirijoOrdenados[0] ?? null;
  const outrosArranjosQueDirijo = arranjosQueDirijoOrdenados.slice(1);

  // Arranjos que dirijo cujo dia já passou (ou é hoje 20h+) e ainda estão
  // ativos — "Finalize a designação" (toda ação do dirigente mora aqui).
  const pendentesFinalizar = brutos
    .filter((a) => precisaFinalizar(a, hoje))
    .map((a) => ({
      id: a.id,
      nome: a.nome ?? 'Arranjo',
      data: a.data as string,
      quadras_ids: (a.quadras_ids ?? []) as string[],
      cartas_locais_ids: (a.cartas_locais_ids ?? []) as number[],
      tces_ids: (a.tces_ids ?? []) as string[],
      quadrasGeo: quadrasPorArranjo((a.quadras_ids ?? []) as string[])
    }));

  const minhasPartes: MinhaParte[] = ((partesMinhasRes.data ?? []) as any[]).map((p) => ({
    id: p.id,
    arranjo_nome: p.arranjos?.nome ?? 'Arranjo',
    colegas: (p.publicadores as string[]).filter((id) => id !== locals.user!.id).map((id) => nomesPorId.get(id) ?? '?'),
    quadras_ids: (p.quadras_ids ?? []) as string[],
    locais_ids: (p.locais_ids ?? []) as number[],
    tces_ids: (p.tces_ids ?? []) as string[]
  }));

  // Todas as partes JÁ CRIADAS dos arranjos que dirijo (válidos) — pra
  // lista "Partes criadas" + saber o que já foi repartido.
  let partesDosMeusArranjos: ParteLinha[] = [];
  let publicadoresParaRepartir: { id: string; nome: string; role: string }[] = [];
  if (podeCoordenar && arranjosQueDirijoOrdenados.length > 0) {
    const idsArranjos = arranjosQueDirijoOrdenados.map((a) => a.id);
    const [{ data: todasPartes }, pubs] = await Promise.all([
      locals.supabase
        .from('arranjo_partes')
        .select('id, arranjo_id, quadras_ids, locais_ids, tces_ids, publicadores, notas')
        .in('arranjo_id', idsArranjos)
        .order('criada_em'),
      listarPublicadores(locals.supabase)
    ]);
    const nomePorArranjo = new Map(arranjosQueDirijoOrdenados.map((a) => [a.id, a.nome]));
    partesDosMeusArranjos = ((todasPartes ?? []) as any[]).map((p) => ({
      id: p.id,
      arranjo_id: p.arranjo_id,
      arranjo_nome: nomePorArranjo.get(p.arranjo_id) ?? 'Arranjo',
      quadras_ids: (p.quadras_ids ?? []) as string[],
      locais_ids: (p.locais_ids ?? []) as number[],
      tces_ids: (p.tces_ids ?? []) as string[],
      publicadores: (p.publicadores ?? []) as string[],
      notas: p.notas ?? null
    }));
    publicadoresParaRepartir = pubs;
  }

  // Território pessoal (designação individual, não é grupo) — pra 3ª seção.
  const minhasComoLider = designacoes.filter((d: any) => d.publicador_id === locals.user!.id && d.status === 'aberta' && d.tipo !== 'cartas');
  const idsPessoais = [...new Set(minhasComoLider.flatMap((d) => d.quadras_ids))];
  const territorioPessoal = idsPessoais.map((id) => quadrasMap.get(id)).filter(Boolean) as QuadraGeo[];

  // A21-f2: TCEs designados como território pessoal (via designacao_tces).
  let territorioPessoalTces: string[] = [];
  if (minhasComoLider.length > 0) {
    const { data: dtRows } = await locals.supabase
      .from('designacao_tces')
      .select('tce_id')
      .in('designacao_id', minhasComoLider.map((d: any) => d.id));
    territorioPessoalTces = [...new Set((dtRows ?? []).map((r: any) => r.tce_id as string))];
  }

  // Nomes de TCEs referenciados (arranjo que dirijo, partes, pendências de
  // finalizar, território pessoal)
  const tceIdsRefs = [...new Set([
    ...arranjosQueDirijoOrdenados.flatMap((a) => a.tces_ids),
    ...pendentesFinalizar.flatMap((a) => a.tces_ids),
    ...minhasPartes.flatMap((p) => p.tces_ids),
    ...partesDosMeusArranjos.flatMap((p) => p.tces_ids),
    ...territorioPessoalTces
  ])];
  const tcesMap: Record<string, string> = {};
  if (tceIdsRefs.length > 0) {
    const { data: tcesRows } = await locals.supabase.from('tces').select('id, nome').in('id', tceIdsRefs);
    for (const t of (tcesRows ?? []) as any[]) tcesMap[t.id] = t.nome;
  }

  // A2: cobertura por quadra do "Seu grupo" — pro sheet de ação (Concluir/
  // Compartilhar) mostrar X/Y endereços feitos.
  const coberturaPorQuadraMap = arranjoQueDirijo
    ? await calcularCoberturaPorQuadra(locals.supabase, arranjoQueDirijo.quadras_ids)
    : new Map<string, CoberturaQuadra>();
  const coberturaPorQuadra = Object.fromEntries(coberturaPorQuadraMap);

  return {
    arranjoQueDirijo: arranjoQueDirijo ? { ...arranjoQueDirijo, quadrasGeo: quadrasPorArranjo(arranjoQueDirijo.quadras_ids) } : null,
    coberturaPorQuadra,
    outrosArranjosQueDirijo,
    pendentesFinalizar,
    minhasPartes: minhasPartes.map((p) => ({ ...p, quadrasGeo: quadrasPorArranjo(p.quadras_ids) })),
    partesDosMeusArranjos,
    publicadoresParaRepartir,
    nomesPorId: Object.fromEntries(nomesPorId),
    tcesMap,
    territorioPessoal,
    territorioPessoalTces,
    minhaId: locals.user!.id
  };
};

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
