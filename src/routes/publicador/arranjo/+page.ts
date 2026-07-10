// W9: load UNIVERSAL no BROWSER (ssr=false) com cache offline — agenda
// de pregação em grupo é tela de campo, mesma receita W3/W4/W5/W8
// (comCache + supabaseBrowser, RLS decide o que aparece). Actions
// continuam em +page.server.ts.
import type { PageLoad } from './$types';
import { supabaseBrowser } from '$lib/supabase-browser';
import { selectAll } from '$lib/queries';
import { comCache } from '$lib/offline/cache-leitura';
import type { ArranjoBase } from '$lib/arranjos';

export const ssr = false;

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

export function chaveArranjoCampo(userId: string): string {
  return `campo:arranjo:${userId}`;
}

export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  if (!profile) {
    return {
      arranjos: [], modalidades: [], dirigentes: {}, prediosMap: {} as Record<number, PredioChip>,
      partes: [] as ParteLinha[], nomesPorId: {} as Record<string, string>,
      tcesMap: {} as Record<string, string>, minhaId: '', podeCoordenar: false,
      cacheInfo: { deCache: false, gravadoEm: Date.now() }
    };
  }

  const podeCoordenar = ['dirigente', 'admin'].includes(profile.role ?? '');
  const r = await comCache(chaveArranjoCampo(profile.id), () => carregarArranjoCampo());

  return { ...r.valor, minhaId: profile.id, podeCoordenar, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

// Exportada pra ser reusada pelo prefetch da carteira (campo-fetchers.ts)
// — MESMA função, MESMA chave de cache, senão o prefetch não serve pra nada.
export async function carregarArranjoCampo() {
  const supabase = supabaseBrowser();

  const [arranjos, modalidades, profsRes, partesRes] = await Promise.all([
    selectAll<ArranjoLinha>(
      supabase
        .from('arranjos')
        .select('*')
        .eq('ativo', true)
        .order('dia_semana', { nullsFirst: false })
        .order('hora_inicio', { nullsFirst: false })
    ),
    selectAll<ModalidadeLite>(
      supabase.from('arranjo_modalidades').select('id, nome, tipo_territorio, cor')
    ),
    supabase.from('profiles').select('id, nome, role'),
    supabase
      .from('arranjo_partes')
      .select('id, arranjo_id, quadras_ids, locais_ids, publicadores, notas')
      .order('criada_em')
  ]);

  // Query crua não lança em falha de rede — sem lançar aqui, o comCache
  // gravaria agenda sem nomes/partes por cima do snapshot bom (ver W5).
  if (profsRes.error) throw profsRes.error;
  if (partesRes.error) throw partesRes.error;

  const profs = profsRes.data;
  const dirigentes: Record<string, string> = {};
  const nomesPorId: Record<string, string> = {};
  for (const p of profs ?? []) {
    nomesPorId[p.id] = p.nome;
    if (p.role === 'dirigente' || p.role === 'admin') dirigentes[p.id] = p.nome;
  }

  const partes = (partesRes.data ?? []) as ParteLinha[];

  const tceIds = Array.from(new Set(arranjos.flatMap((a: any) => a.tces_ids ?? [])));
  const tcesMap: Record<string, string> = {};
  if (tceIds.length > 0) {
    const { data: tces } = await supabase.from('tces').select('id, nome').in('id', tceIds);
    for (const t of (tces ?? []) as any[]) tcesMap[t.id] = t.nome;
  }

  const predioIds = Array.from(
    new Set(arranjos.flatMap((a) => a.cartas_locais_ids ?? []).filter((n) => Number.isFinite(n)))
  );
  const prediosMap: Record<number, PredioChip> = {};
  if (predioIds.length > 0) {
    const [locaisRes, unidsRes] = await Promise.all([
      supabase.from('locais').select('id, logradouro, numero, nome').in('id', predioIds),
      selectAll<{ local_id: number; carta_entregue: string | null }>(
        supabase.from('unidades').select('local_id, carta_entregue').in('local_id', predioIds)
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

  return { arranjos, modalidades, dirigentes, prediosMap, partes, nomesPorId, tcesMap };
}
