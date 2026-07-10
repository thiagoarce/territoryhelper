// W9: load UNIVERSAL no BROWSER (ssr=false) com cache offline — mesma
// receita W3/W4/W5/W8. Tela ÚNICA de trabalhar prédio (casa a casa +
// cartas), já usa postComFila nas duas ações mais frequentes (W8);
// faltava só o load sair do Worker pra fechar o ciclo 100% offline.
// Sem checagem de posse aqui (igual ao load server antigo) — só exige
// login; posse é exigida nas actions via podeEditarLocal (RPC).
import type { PageLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { carregarPredioDetalhado, selectAll, cicloCartasPorLocal, cicloEfetivo } from '$lib/queries';
import { desfechoNoCicloAtual, cartaEscritaNoCiclo } from '$lib/ciclos';
import { comCache } from '$lib/offline/cache-leitura';

export const ssr = false;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180, Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Chave inclui o uid como TODAS as outras (convenção do cache-leitura:
// aparelho compartilhado, um usuário não abre snapshot do outro).
export function chavePredioCampo(id: number, userId: string): string {
  return `campo:predio:${id}:${userId}`;
}

export const load: PageLoad = async ({ params, parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) throw error(400, 'ID inválido');

  const r = await comCache(chavePredioCampo(id, profile.id), () => carregarPredioCampo(id));
  return { ...r.valor, minhaRole: profile.role, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

// Exportada pra ser reusada pelo prefetch da carteira (campo-fetchers.ts)
// — MESMA função, MESMA chave de cache, senão o prefetch não serve pra nada.
export async function carregarPredioCampo(id: number) {
  const supabase = supabaseBrowser();
  const ciclos = await cicloCartasPorLocal(supabase, [id]);
  const ciclo = cicloEfetivo(ciclos, id);
  const predio = await carregarPredioDetalhado(supabase, id, ciclo?.iniciado_em);
  if (!predio) throw error(404, 'Prédio não encontrado');

  // U2: quadras próximas (pra "não pertence a esta quadra")
  let quadrasProximas: { id: string; distancia_m: number }[] = [];
  const coordsPredio = (predio.geo_geojson as any)?.coordinates;
  if (coordsPredio) {
    const { data: quadrasGeo } = await supabase
      .from('quadras_geo')
      .select('id, poly_geojson, ativa')
      .eq('ativa', true);
    for (const q of (quadrasGeo ?? []) as any[]) {
      if (q.id === predio.quadra_id) continue;
      const anel = q.poly_geojson?.coordinates?.[0] as [number, number][] | undefined;
      if (!anel || anel.length === 0) continue;
      let somaLat = 0, somaLng = 0;
      for (const [lng, lat] of anel) { somaLat += lat; somaLng += lng; }
      const centroLat = somaLat / anel.length, centroLng = somaLng / anel.length;
      quadrasProximas.push({
        id: q.id,
        distancia_m: haversine(coordsPredio[1], coordsPredio[0], centroLat, centroLng)
      });
    }
    quadrasProximas.sort((a, b) => a.distancia_m - b.distancia_m);
    quadrasProximas = quadrasProximas.slice(0, 8);
  }

  // Ciclo do casa em casa = última conclusão da quadra do prédio
  let dataConclusaoQuadra: string | null = null;
  if (predio.quadra_id) {
    const { data: q } = await supabase
      .from('quadras').select('data_conclusao').eq('id', predio.quadra_id).maybeSingle();
    dataConclusaoQuadra = q?.data_conclusao ?? null;
  }

  // Enriquece unidades com último registro (pra modo casa-em-casa)
  const unidadeIds = predio.unidades.map((u) => u.id);
  let ultimoPorUnidade: Record<number, { tipo: string; ts: string }> = {};
  if (unidadeIds.length > 0) {
    const registros = await selectAll<{ unidade_id: number; tipo: string; ts: string }>(
      supabase
        .from('registros')
        .select('unidade_id, tipo, ts')
        .in('unidade_id', unidadeIds)
        .order('ts', { ascending: false })
    );
    for (const r of registros) {
      if (!ultimoPorUnidade[r.unidade_id]) {
        ultimoPorUnidade[r.unidade_id] = { tipo: r.tipo, ts: r.ts };
      }
    }
  }
  // Nome de quem escreveu a carta (aba Cartas mostra pequeno ao lado da data)
  const escritores = [...new Set(predio.unidades.map((u: any) => u.carta_escrita_por).filter(Boolean))] as string[];
  let nomeEscritorPorId = new Map<string, string>();
  if (escritores.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, nome').in('id', escritores);
    nomeEscritorPorId = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
  }

  const unidades = predio.unidades.map((u: any) => {
    const ult = ultimoPorUnidade[u.id];
    const noCiclo = desfechoNoCicloAtual(ult?.ts, dataConclusaoQuadra);
    const ehDesfeito = ult?.tipo === 'desfeito' || ult?.tipo === 'carta_undo';
    return {
      ...u,
      ultimo_tipo: noCiclo ? ult?.tipo ?? null : null,
      ultimo_ts: noCiclo ? ult?.ts ?? null : null,
      desfecho_anterior: !noCiclo && ult && !ehDesfeito ? ult.tipo : null,
      desfecho_anterior_ts: !noCiclo && ult && !ehDesfeito ? ult.ts : null,
      carta_escrita_por_nome: u.carta_escrita_por ? nomeEscritorPorId.get(u.carta_escrita_por) ?? null : null
    };
  });

  return {
    predio: { ...predio, unidades },
    cicloCartasInicio: ciclo?.iniciado_em ?? null,
    cicloCartas: ciclo,
    quadrasProximas
  };
}
