import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { selectAll, listarQuadrasComGeo } from '$lib/server/queries';

export interface LocalComGeo {
  id: number;
  tipo: string;
  logradouro: string;
  numero: string;
  setor: string | null;
  quadra_ibge: string | null;
  quadra_id: string | null;
  lat: number | null;
  lng: number | null;
}

interface LocalDaView {
  id: number;
  tipo: string;
  logradouro: string;
  numero: string;
  setor: string | null;
  quadra_ibge: string | null;
  quadra_id: string | null;
  geo_geojson: { coordinates: [number, number] } | null;
}

interface QuadraEstatisticaIbge {
  quadra_id: string;
  cluster: string;        // setor|quadra_ibge
  qtd: number;
}

export const load: PageServerLoad = async ({ locals }) => {
  // TODOS os locais com geo (extrai lat/lng do geo_geojson da view)
  const linhas = await selectAll<LocalDaView>(
    locals.supabase
      .from('locais_geo')
      .select('id, tipo, logradouro, numero, setor, quadra_ibge, quadra_id, geo_geojson')
      .not('geo_geojson', 'is', null)
  );
  const locais: LocalComGeo[] = linhas.map((l) => {
    const c = l.geo_geojson?.coordinates;
    return {
      id: l.id,
      tipo: l.tipo,
      logradouro: l.logradouro,
      numero: l.numero,
      setor: l.setor,
      quadra_ibge: l.quadra_ibge,
      quadra_id: l.quadra_id,
      lat: c ? c[1] : null,
      lng: c ? c[0] : null
    };
  }).filter((l) => l.lat != null && l.lng != null);

  const quadras = await listarQuadrasComGeo(locals.supabase);

  // Quadras pra UI de renomeio
  const quadrasParaRenomear = quadras.map((q) => ({ id: q.id, color: q.color, status: q.status }));

  // Distribuição setor|quadra_ibge por quadra (pra detectar inconsistências)
  const clusterPorQuadra = new Map<string, Map<string, number>>();
  for (const l of locais) {
    if (!l.quadra_id) continue;
    const cluster = `${l.setor || ''}|${l.quadra_ibge || ''}`;
    if (!clusterPorQuadra.has(l.quadra_id)) clusterPorQuadra.set(l.quadra_id, new Map());
    const m = clusterPorQuadra.get(l.quadra_id)!;
    m.set(cluster, (m.get(cluster) || 0) + 1);
  }
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

  const idsComLocais = new Set(clusterPorQuadra.keys());
  const quadrasVazias = quadras
    .filter((q) => !idsComLocais.has(q.id) && q.status !== 'inativa')
    .map((q) => q.id);

  return {
    locais,
    quadras,
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
    const localIds = fd.getAll('local_ids').map((v) => Number(v)).filter(Boolean);
    const quadraId = String(fd.get('quadra_id') ?? '');
    if (localIds.length === 0 || !quadraId) return fail(400, { erro: 'local_ids e quadra_id obrigatórios' });
    const { error } = await locals.supabase.from('locais').update({ quadra_id: quadraId }).in('id', localIds);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${localIds.length} endereço(s) vinculado(s) a ${quadraId}` };
  },

  // Marca/desmarca endereços como "não visitar" — esconde do publicador
  toggleAtivacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const localIds = fd.getAll('local_ids').map((v) => Number(v)).filter(Boolean);
    const ativar = fd.get('ativar') === 'true';
    if (localIds.length === 0) return fail(400, { erro: 'Sem endereços' });
    // ativar=true → nao_visitar=false (volta a ser endereço ativo)
    const { error } = await locals.supabase
      .from('locais').update({ nao_visitar: !ativar }).in('id', localIds);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${localIds.length} endereço(s) ${ativar ? 'ativado(s)' : 'desativado(s)'}` };
  },

  // Remove vínculo (volta pra "sem quadra")
  desvincular: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const localIds = fd.getAll('local_ids').map((v) => Number(v)).filter(Boolean);
    if (localIds.length === 0) return fail(400, { erro: 'Sem endereços' });
    const { error } = await locals.supabase
      .from('locais').update({ quadra_id: null }).in('id', localIds);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${localIds.length} endereço(s) desvinculado(s)` };
  },

  // Muda status da quadra (pendente / concluido / inativa)
  alterarStatusQuadra: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const status = String(fd.get('status') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    if (!['pendente', 'concluido', 'inativa'].includes(status)) return fail(400, { erro: 'status inválido' });
    const patch: any = { status };
    // Voltar pra pendente ou inativa zera data_conclusao
    if (status !== 'concluido') patch.data_conclusao = null;
    const { error } = await locals.supabase.from('quadras').update(patch).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${id} → ${status}` };
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
