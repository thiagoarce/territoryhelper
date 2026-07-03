import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarDesignacoes, listarQuadrasComGeo, calcularCoberturaPorQuadra } from '$lib/server/queries';

export interface CampanhaAtiva {
  id: number;
  nome: string;
  data_inicio: string;
  data_alvo: string;
  meta_semanal: number | null;
  concluidas_no_periodo: number;
  total_meta: number;
}

export const load: PageServerLoad = async ({ locals }) => {
  const hoje = new Date().toISOString().substring(0, 10);
  const ontem = new Date(Date.now() - 86400000).toISOString().substring(0, 10);

  const [designacoes, quadras, campanhaRes, partesRes, dirijoRes, profRes] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarQuadrasComGeo(locals.supabase),
    locals.supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal, ativa')
      .eq('ativa', true)
      .maybeSingle(),
    // Partes de arranjo que me incluem (dupla/trio) — válidas pela data do arranjo
    locals.supabase
      .from('arranjo_partes')
      .select('id, quadras_ids, locais_ids, publicadores, notas, arranjos!inner(id, nome, data, hora_inicio, local_endereco, dirigente_id, ativo)')
      .contains('publicadores', [locals.user!.id])
      .eq('arranjos.ativo', true)
      .gte('arranjos.data', ontem)
      .order('criada_em', { ascending: false }),
    // Arranjos que EU dirijo (de ontem em diante — a saída de ontem à noite
    // ainda interessa de manhã) — card "Você dirige"
    locals.supabase
      .from('arranjos')
      .select('id, nome, data, hora_inicio, local_endereco, quadras_ids, cartas_locais_ids, tce_id')
      .eq('ativo', true)
      .eq('dirigente_id', locals.user!.id)
      .gte('data', ontem)
      .order('data')
      .limit(5),
    locals.supabase.from('profiles').select('id, nome')
  ]);
  // Home = CARTEIRA PESSOAL, mesmo pra dirigente/admin (que são publicadores
  // no campo). A visão de todas as designações mora no mapa estratégico e
  // no hub /admin/designacoes — não aqui.
  const minhas = designacoes.filter((d) => d.publicador_id === locals.user!.id);
  const abertas = minhas.filter((d) => d.status === 'aberta');
  const concluidas = minhas.filter((d) => d.status === 'concluida');

  const idsAbertas = [...new Set(abertas.flatMap((d) => d.quadras_ids))];
  const cobertura = idsAbertas.length > 0
    ? await calcularCoberturaPorQuadra(locals.supabase, idsAbertas)
    : new Map();

  const quadrasMap = new Map(quadras.map((q) => [q.id, q]));

  const { data: tceRows } = await locals.supabase
    .from('tces')
    .select('id, nome, tipo, prazo, status')
    .eq('status', 'aberto')
    .not('publicador_id', 'is', null)
    .order('prazo', { nullsFirst: false });
  const tces = (tceRows ?? []) as { id: string; nome: string; tipo: string; prazo: string | null; status: string }[];

  // Campanha ativa: card destacado no topo (specs.md Fase 2)
  let campanhaAtiva: CampanhaAtiva | null = null;
  const c = campanhaRes.data as any;
  if (c) {
    const conclNoPeriodo = quadras.filter(
      (q) => q.data_conclusao && q.data_conclusao >= c.data_inicio && q.data_conclusao <= c.data_alvo
    ).length;
    campanhaAtiva = {
      id: c.id,
      nome: c.nome,
      data_inicio: c.data_inicio,
      data_alvo: c.data_alvo,
      meta_semanal: c.meta_semanal,
      concluidas_no_periodo: conclNoPeriodo,
      total_meta: quadras.length
    };
  }

  // Partes de arranjo que eu recebi (card no topo do home)
  const nomePorId = new Map((profRes.data ?? []).map((p: any) => [p.id, p.nome as string]));
  const minhasPartes = (partesRes.data ?? []).map((p: any) => ({
    id: p.id,
    arranjo_nome: p.arranjos?.nome ?? 'Arranjo',
    arranjo_data: p.arranjos?.data ?? null,
    hora_inicio: p.arranjos?.hora_inicio ?? null,
    local_endereco: p.arranjos?.local_endereco ?? null,
    dirigente_nome: p.arranjos?.dirigente_id ? nomePorId.get(p.arranjos.dirigente_id) ?? '?' : null,
    colegas: (p.publicadores as string[])
      .filter((id) => id !== locals.user!.id)
      .map((id) => nomePorId.get(id) ?? '?'),
    quadras_ids: p.quadras_ids as string[],
    locais_ids: p.locais_ids as number[]
  }));

  // Arranjos que eu dirijo — card "Você dirige" com o território completo
  const arranjosQueDirijo = (dirijoRes.data ?? []).map((a: any) => ({
    id: a.id,
    nome: a.nome ?? 'Arranjo',
    data: a.data as string,
    hora_inicio: a.hora_inicio as string | null,
    local_endereco: a.local_endereco as string | null,
    quadras_ids: (a.quadras_ids ?? []) as string[],
    cartas_locais_ids: (a.cartas_locais_ids ?? []) as number[],
    tce_id: a.tce_id as string | null
  }));

  // Designações de cartas (tipo='cartas') — resolve prédios associados via
  // designacao_locais + tabela locais pra mostrar chip clicável no home
  const abertasCartas = abertas.filter((d: any) => d.tipo === 'cartas');
  let cartasDesignadas: {
    designacao_id: number;
    prazo: string | null;
    predios: { id: number; nome: string | null; logradouro: string; numero: string; qtd_entregues: number; qtd_aptos: number }[];
  }[] = [];
  if (abertasCartas.length > 0) {
    const desigIds = abertasCartas.map((d) => d.id);
    const { data: locaisJoin } = await locals.supabase
      .from('designacao_locais')
      .select('designacao_id, local_id')
      .in('designacao_id', desigIds);
    const localIds = Array.from(new Set((locaisJoin ?? []).map((r: any) => r.local_id)));
    if (localIds.length > 0) {
      const [locDetalhes, unidsPorLocal] = await Promise.all([
        locals.supabase.from('locais').select('id, nome, logradouro, numero').in('id', localIds),
        locals.supabase.from('unidades').select('local_id, carta_entregue').in('local_id', localIds)
      ]);
      const stats: Record<number, { qtd: number; ent: number }> = {};
      for (const u of (unidsPorLocal.data ?? []) as any[]) {
        const s = (stats[u.local_id] ||= { qtd: 0, ent: 0 });
        s.qtd++;
        if (u.carta_entregue) s.ent++;
      }
      const detById = new Map((locDetalhes.data ?? []).map((l: any) => [l.id, l]));
      const prediosPorDesig: Record<number, any[]> = {};
      for (const j of (locaisJoin ?? []) as any[]) {
        const l = detById.get(j.local_id);
        if (!l) continue;
        (prediosPorDesig[j.designacao_id] ||= []).push({
          id: l.id,
          nome: l.nome,
          logradouro: l.logradouro,
          numero: l.numero,
          qtd_entregues: stats[l.id]?.ent ?? 0,
          qtd_aptos: stats[l.id]?.qtd ?? 0
        });
      }
      cartasDesignadas = abertasCartas.map((d: any) => ({
        designacao_id: d.id,
        prazo: d.prazo,
        predios: prediosPorDesig[d.id] ?? []
      }));
    }
  }

  return {
    abertas,
    concluidas,
    quadrasMap: Object.fromEntries(quadrasMap),
    cobertura: Object.fromEntries(cobertura),
    tces,
    campanhaAtiva,
    minhasPartes,
    arranjosQueDirijo,
    cartasDesignadas,
    minhaRole: locals.profile?.role
  };
};

export const actions: Actions = {
  // Link público /t/<token> — da PRÓPRIA designação (RLS permite o dono)
  // OU de um arranjo (dirigente/admin, pelo card "Você dirige")
  gerarLinkTerritorio: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const designacaoId = Number(fd.get('designacao_id') ?? 0);
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!designacaoId && !arranjoId) return fail(400, { erro: 'id obrigatório' });
    const row: any = { criado_por: locals.user.id };
    if (arranjoId) row.arranjo_id = arranjoId;
    else row.designacao_id = designacaoId;
    const { data, error } = await locals.supabase
      .from('territorio_tokens')
      .insert(row)
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, token: data.token };
  }
};
