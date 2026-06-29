import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { selectAll } from '$lib/server/queries';

interface LocalSemQuadra {
  id: number;
  tipo: string;
  logradouro: string;
  numero: string;
  setor: string | null;
  quadra_ibge: string | null;
  geo_geojson: unknown | null;
}

interface QuadraEstatisticaIbge {
  quadra_id: string;
  cluster: string;        // setor|quadra_ibge
  qtd: number;
}

export const load: PageServerLoad = async ({ locals }) => {
  // Locais sem quadra (paginado) — pode passar de 1000 numa cidade grande
  const semQuadra = await selectAll<LocalSemQuadra>(
    locals.supabase
      .from('locais_geo')
      .select('id, tipo, logradouro, numero, setor, quadra_ibge, geo_geojson')
      .is('quadra_id', null)
      .order('setor', { nullsFirst: false })
      .order('quadra_ibge', { nullsFirst: false })
  );

  // Quadras pra UI de renomeio
  const { data: todasQuadrasFull } = await locals.supabase
    .from('quadras').select('id, color, status').order('id');
  const quadrasParaRenomear = (todasQuadrasFull ?? []) as { id: string; color: string; status: string }[];

  // Distribuição setor|quadra_ibge por quadra (pra detectar inconsistências).
  // Paginado obrigatório — 2774 locais > 1000 limit.
  const porQuadra = await selectAll<{ quadra_id: string | null; setor: string | null; quadra_ibge: string | null }>(
    locals.supabase.from('locais').select('quadra_id, setor, quadra_ibge')
  );

  const clusterPorQuadra = new Map<string, Map<string, number>>();
  for (const l of porQuadra ?? []) {
    if (!l.quadra_id) continue;
    const cluster = `${l.setor || ''}|${l.quadra_ibge || ''}`;
    if (!clusterPorQuadra.has(l.quadra_id)) clusterPorQuadra.set(l.quadra_id, new Map());
    const m = clusterPorQuadra.get(l.quadra_id)!;
    m.set(cluster, (m.get(cluster) || 0) + 1);
  }
  // Quadras com >1 cluster (potencial erro)
  const quadrasMultiCluster: { quadra_id: string; clusters: { cluster: string; qtd: number }[] }[] = [];
  for (const [qid, m] of clusterPorQuadra) {
    if (m.size > 1) {
      quadrasMultiCluster.push({
        quadra_id: qid,
        clusters: [...m].map(([cluster, qtd]) => ({ cluster, qtd })).sort((a, b) => b.qtd - a.qtd)
      });
    }
  }
  quadrasMultiCluster.sort((a, b) => a.quadra_id.localeCompare(b.quadra_id));

  // Quadras vazias (sem nenhum local vinculado)
  const { data: todasQuadras } = await locals.supabase.from('quadras').select('id, status');
  const idsComLocais = new Set(clusterPorQuadra.keys());
  const quadrasVazias = (todasQuadras ?? [])
    .filter((q) => !idsComLocais.has(q.id) && q.status !== 'inativa')
    .map((q) => q.id);

  return {
    semQuadra,
    quadrasMultiCluster,
    quadrasVazias,
    quadrasParaRenomear
  };
};

export const actions: Actions = {
  autoVincular: async ({ locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const { data, error } = await locals.supabase.rpc('auto_vincular_enderecos' as any);
    if (error) return fail(400, { erro: error.message });
    const r = (data as any)?.[0];
    return { ok: true, msg: `${r?.vinculados ?? 0} endereço(s) vinculado(s) automaticamente (${r?.sem_match ?? 0} sem polígono correspondente).` };
  },

  vincularManual: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const localId = Number(fd.get('local_id') ?? 0);
    const quadraId = String(fd.get('quadra_id') ?? '');
    if (!localId || !quadraId) return fail(400, { erro: 'local_id e quadra_id obrigatórios' });
    const { error } = await locals.supabase.from('locais').update({ quadra_id: quadraId }).eq('id', localId);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Vinculado' };
  },

  // Renomeia uma quadra propagando o id em CASCADE (FK ON UPDATE):
  // - quadras.id → designacao_quadras.quadra_id, locais.quadra_id seguem auto.
  // Mas como nossas FKs estão como ON DELETE SET NULL/CASCADE e não ON UPDATE,
  // fazemos manualmente: insere nova, copia, atualiza refs, deleta antiga.
  renomearQuadra: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const idAntigo = String(fd.get('id_antigo') ?? '');
    const idNovo = String(fd.get('id_novo') ?? '').trim();
    if (!idAntigo || !idNovo) return fail(400, { erro: 'IDs obrigatórios' });
    if (idAntigo === idNovo) return { ok: true, msg: 'Sem mudança' };

    // Verifica que o novo não existe
    const { data: existe } = await locals.supabase.from('quadras').select('id').eq('id', idNovo).maybeSingle();
    if (existe) return fail(400, { erro: `Quadra ${idNovo} já existe` });

    // Pega dados da antiga
    const { data: antiga } = await locals.supabase.from('quadras').select('*').eq('id', idAntigo).maybeSingle();
    if (!antiga) return fail(400, { erro: 'Quadra antiga não encontrada' });

    // 1. Cria nova com os mesmos dados
    const { error: e1 } = await locals.supabase.from('quadras').insert({ ...antiga, id: idNovo });
    if (e1) return fail(400, { erro: 'Erro criando nova: ' + e1.message });

    // 2. Atualiza refs
    await locals.supabase.from('locais').update({ quadra_id: idNovo }).eq('quadra_id', idAntigo);
    await locals.supabase.from('designacao_quadras').update({ quadra_id: idNovo }).eq('quadra_id', idAntigo);

    // 3. Remove antiga
    const { error: e2 } = await locals.supabase.from('quadras').delete().eq('id', idAntigo);
    if (e2) return fail(400, { erro: 'Erro removendo antiga: ' + e2.message });

    return { ok: true, msg: `Renomeada de ${idAntigo} → ${idNovo}` };
  }
};
