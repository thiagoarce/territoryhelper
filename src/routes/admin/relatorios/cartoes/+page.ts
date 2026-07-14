// Impressão em lote dos Cartões S-12: renovar o fichário físico inteiro
// de uma vez em vez de gerar território por território via /t/<token>.
// Load universal (regra da casa) — busca todas as quadras com geometria
// de uma vez; a geração de PNG por cartão acontece no componente.
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { selectAll } from '$lib/queries';
import { comCache } from '$lib/offline/cache-leitura';
import type { QuadraContexto } from '$lib/components/CartaoTerritorio.svelte';

export const ssr = false;

export interface TerritorioParaCartao {
  id: string;
  nome: string | null;
  quadraIds: string[];
}

export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');

  const r = await comCache(`admin:cartoes:${profile.id}`, carregar);
  return { ...r.valor, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

async function carregar() {
  const supabase = supabaseBrowser();
  const [terrRes, quadras] = await Promise.all([
    supabase.from('territorios').select('id, nome').order('id'),
    selectAll<QuadraContexto & { ativa: boolean }>(
      supabase.from('quadras_geo').select('id, territorio_id, data_conclusao, poly_geojson, ativa').order('id')
    )
  ]);
  if (terrRes.error) throw terrRes.error;

  const quadrasContexto: QuadraContexto[] = quadras.map((q) => ({
    id: q.id,
    territorio_id: q.territorio_id,
    data_conclusao: q.data_conclusao,
    poly_geojson: q.poly_geojson
  }));

  const quadraIdsPorTerr = new Map<string, string[]>();
  for (const q of quadras) {
    if (!q.territorio_id || !q.ativa) continue;
    (quadraIdsPorTerr.get(q.territorio_id) ?? quadraIdsPorTerr.set(q.territorio_id, []).get(q.territorio_id)!)
      .push(q.id);
  }

  const territorios: TerritorioParaCartao[] = ((terrRes.data ?? []) as { id: string; nome: string | null }[])
    .filter((t) => (quadraIdsPorTerr.get(t.id) ?? []).length > 0)
    .map((t) => ({ id: t.id, nome: t.nome, quadraIds: quadraIdsPorTerr.get(t.id) ?? [] }));

  return { territorios, quadrasContexto };
}
