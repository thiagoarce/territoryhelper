// E2: Registro de Designação de Território (S-13-T) — load universal no
// browser (regra da casa: agregação pesada nunca no Worker). Puxa TODO o
// histórico (designações, arranjos, conclusões) e monta os ciclos por
// território com a lógica pura de $lib/s13 (testada em tests/s13.test.ts).
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { selectAll } from '$lib/queries';
import { comCache } from '$lib/offline/cache-leitura';
import { ciclosDoTerritorio, anoDeServicoDe, type CicloTerritorio, type EventoDesignacao, type Conclusao } from '$lib/s13';
import { hojeIsoBrasil } from '$lib/utils/data';

export const ssr = false;

export interface TerritorioComCiclos {
  id: string;
  nome: string | null;
  ciclos: CicloTerritorio[];
}

export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');

  const r = await comCache(`admin:s13:${profile.id}`, carregar);
  const anoAtual = anoDeServicoDe(hojeIsoBrasil());
  return { ...r.valor, anoAtual, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

async function carregar() {
  const supabase = supabaseBrowser();
  const [terrRes, quadras, conclusoes, dq, desigRes, arranjos, profRes] = await Promise.all([
    supabase.from('territorios').select('id, nome').order('id'),
    selectAll<{ id: string; territorio_id: string | null; data_conclusao: string | null }>(
      supabase.from('quadras').select('id, territorio_id, data_conclusao').eq('ativa', true).order('id')
    ),
    selectAll<{ quadra_id: string; data_conclusao: string }>(
      supabase.from('quadras_conclusoes').select('quadra_id, data_conclusao').order('id')
    ),
    selectAll<{ designacao_id: number; quadra_id: string }>(
      supabase.from('designacao_quadras').select('designacao_id, quadra_id').order('designacao_id')
    ),
    supabase.from('designacoes').select('id, criada_em, publicador_id'),
    // TODOS os arranjos (inclusive finalizados/inativos) — é histórico
    selectAll<{ id: number; data: string | null; quadras_ids: string[] | null }>(
      supabase.from('arranjos').select('id, data, quadras_ids').order('id')
    ),
    supabase.from('profiles').select('id, nome')
  ]);
  if (terrRes.error) throw terrRes.error;
  if (desigRes.error) throw desigRes.error;
  if (profRes.error) throw profRes.error;

  const nomePorId = new Map((profRes.data ?? []).map((p: any) => [p.id, p.nome as string]));
  const desigPorId = new Map((desigRes.data ?? []).map((d: any) => [d.id, d]));

  // quadra → território (só ativas)
  const territorioDaQuadra = new Map<string, string>();
  for (const q of quadras) if (q.territorio_id) territorioDaQuadra.set(q.id, q.territorio_id);

  // Conclusões por território (histórico + o snapshot atual de
  // quadras.data_conclusao, que pode ser anterior à tabela de histórico)
  const conclusoesPorTerr = new Map<string, Conclusao[]>();
  const vistos = new Set<string>();
  const addConclusao = (quadraId: string, data: string | null) => {
    if (!data) return;
    const terr = territorioDaQuadra.get(quadraId);
    if (!terr) return;
    const chave = `${quadraId}|${data}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    (conclusoesPorTerr.get(terr) ?? conclusoesPorTerr.set(terr, []).get(terr)!)
      .push({ quadra_id: quadraId, data });
  };
  for (const c of conclusoes) addConclusao(c.quadra_id, c.data_conclusao);
  for (const q of quadras) addConclusao(q.id, q.data_conclusao);

  // Eventos de designação por território
  const eventosPorTerr = new Map<string, EventoDesignacao[]>();
  const addEvento = (quadraId: string, data: string, nome: string | null) => {
    const terr = territorioDaQuadra.get(quadraId);
    if (!terr) return;
    (eventosPorTerr.get(terr) ?? eventosPorTerr.set(terr, []).get(terr)!)
      .push({ data, nome });
  };
  const jaContou = new Set<string>(); // 1 evento por (designacao|arranjo, território)
  for (const liga of dq) {
    const d = desigPorId.get(liga.designacao_id);
    if (!d) continue;
    const terr = territorioDaQuadra.get(liga.quadra_id);
    if (!terr) continue;
    const chave = `d${d.id}|${terr}`;
    if (jaContou.has(chave)) continue;
    jaContou.add(chave);
    addEvento(liga.quadra_id, String(d.criada_em).substring(0, 10), d.publicador_id ? nomePorId.get(d.publicador_id) ?? null : null);
  }
  for (const a of arranjos) {
    if (!a.data) continue;
    for (const qid of a.quadras_ids ?? []) {
      const terr = territorioDaQuadra.get(qid);
      if (!terr) continue;
      const chave = `a${a.id}|${terr}`;
      if (jaContou.has(chave)) continue;
      jaContou.add(chave);
      addEvento(qid, a.data, null);
    }
  }

  const quadrasPorTerr = new Map<string, string[]>();
  for (const q of quadras) {
    if (!q.territorio_id) continue;
    (quadrasPorTerr.get(q.territorio_id) ?? quadrasPorTerr.set(q.territorio_id, []).get(q.territorio_id)!)
      .push(q.id);
  }

  const territorios: TerritorioComCiclos[] = ((terrRes.data ?? []) as { id: string; nome: string | null }[])
    .filter((t) => (quadrasPorTerr.get(t.id) ?? []).length > 0)
    .map((t) => ({
      id: t.id,
      nome: t.nome,
      ciclos: ciclosDoTerritorio(
        quadrasPorTerr.get(t.id) ?? [],
        eventosPorTerr.get(t.id) ?? [],
        conclusoesPorTerr.get(t.id) ?? []
      )
    }));

  // Anos com movimento (pro seletor)
  const anos = new Set<number>();
  for (const t of territorios)
    for (const c of t.ciclos) {
      anos.add(anoDeServicoDe(c.inicio));
      if (c.conclusao) anos.add(anoDeServicoDe(c.conclusao));
    }

  return { territorios, anosDisponiveis: [...anos].sort((a, b) => b - a) };
}
