// E5: Dashboard de saúde do território — load universal no browser
// (regra da casa) + comCache. Tudo derivado de dados que já existem:
// quadras, quadras_conclusoes (append-only), designações abertas e
// arranjos futuros.
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { selectAll, quadrasEmArranjoFuturo } from '$lib/queries';
import { comCache } from '$lib/offline/cache-leitura';
import { hojeIsoBrasil, diasDesde, ehFimDeSemana } from '$lib/utils/data';

export const ssr = false;

export interface QuadraEsquecida {
  id: string;
  territorio_id: string | null;
  data_conclusao: string | null;
  dias: number | null; // null = nunca concluída
}

export interface CicloTerrMedia {
  territorio_id: string;
  nome: string | null;
  mediaDias: number | null; // null = sem 2+ conclusões pra medir
  quadras: number;
}

export interface DiaSemanaTerr {
  territorio_id: string;
  nome: string | null;
  /** contagem simples de quadras concluídas no fim de semana/meio da
   *  semana — SEM normalizar por dias disponíveis. A taxa por dia
   *  (dividir por 2 e por 5) inflava demais o fim de semana e o
   *  resultado ficava sempre "mais fim de semana", mesmo quando o
   *  bruto de meio de semana era claramente maior — não era útil. */
  fimDeSemana: number;
  meioDaSemana: number;
}

export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');
  const r = await comCache(`admin:dashboard:${profile.id}`, carregar);
  return { ...r.valor, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

async function carregar() {
  const supabase = supabaseBrowser();
  const [quadras, conclusoes, terrRes, desigAbertas, dq] = await Promise.all([
    selectAll<{ id: string; territorio_id: string | null; ativa: boolean; data_conclusao: string | null }>(
      supabase.from('quadras').select('id, territorio_id, ativa, data_conclusao').order('id')
    ),
    selectAll<{ quadra_id: string; data_conclusao: string }>(
      supabase.from('quadras_conclusoes').select('quadra_id, data_conclusao').order('id')
    ),
    supabase.from('territorios').select('id, nome').order('id'),
    supabase.from('designacoes').select('id').eq('status', 'aberta'),
    selectAll<{ designacao_id: number; quadra_id: string }>(
      supabase.from('designacao_quadras').select('designacao_id, quadra_id').order('designacao_id')
    )
  ]);
  if (terrRes.error) throw terrRes.error;
  if (desigAbertas.error) throw desigAbertas.error;

  const ativas = quadras.filter((q) => q.ativa);
  const hoje = hojeIsoBrasil();

  // Conclusões por quadra (histórico + snapshot atual, dedup)
  const porQuadra = new Map<string, string[]>();
  const add = (qid: string, data: string | null) => {
    if (!data) return;
    const arr = porQuadra.get(qid) ?? [];
    if (!arr.includes(data)) arr.push(data);
    porQuadra.set(qid, arr);
  };
  for (const c of conclusoes) add(c.quadra_id, c.data_conclusao);
  for (const q of quadras) add(q.id, q.data_conclusao);
  for (const arr of porQuadra.values()) arr.sort();

  // Cobertura: % de quadras ativas com conclusão nos últimos 12 meses
  const umAnoAtras = `${Number(hoje.substring(0, 4)) - 1}${hoje.substring(4)}`;
  const cobertas12m = ativas.filter((q) => (porQuadra.get(q.id) ?? []).some((d) => d >= umAnoAtras)).length;

  // Esquecidas: as 10 com conclusão mais antiga (nunca primeiro)
  const esquecidas: QuadraEsquecida[] = ativas
    .map((q) => {
      const datas = porQuadra.get(q.id) ?? [];
      const ultima = datas.length ? datas[datas.length - 1] : null;
      return { id: q.id, territorio_id: q.territorio_id, data_conclusao: ultima, dias: ultima ? diasDesde(ultima) : null };
    })
    .sort((a, b) => (b.dias ?? Infinity) === (a.dias ?? Infinity) ? a.id.localeCompare(b.id) : (b.dias ?? Infinity) - (a.dias ?? Infinity))
    .slice(0, 10);

  // Tempo médio de ciclo: média dos intervalos entre conclusões
  // consecutivas da MESMA quadra, agregada por território e global.
  const nomeTerr = new Map(((terrRes.data ?? []) as any[]).map((t) => [t.id, t.nome as string | null]));
  const gapsPorTerr = new Map<string, number[]>();
  const gapsGlobais: number[] = [];
  for (const q of ativas) {
    const datas = porQuadra.get(q.id) ?? [];
    for (let i = 1; i < datas.length; i++) {
      const gap = Math.round((new Date(datas[i] + 'T12:00:00').getTime() - new Date(datas[i - 1] + 'T12:00:00').getTime()) / 86400000);
      if (gap <= 0) continue;
      gapsGlobais.push(gap);
      if (q.territorio_id) {
        const arr = gapsPorTerr.get(q.territorio_id) ?? [];
        arr.push(gap);
        gapsPorTerr.set(q.territorio_id, arr);
      }
    }
  }
  const media = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, g) => s + g, 0) / arr.length) : null);
  const cicloPorTerritorio: CicloTerrMedia[] = [...new Set(ativas.map((q) => q.territorio_id).filter(Boolean) as string[])]
    .sort()
    .map((tid) => ({
      territorio_id: tid,
      nome: nomeTerr.get(tid) ?? null,
      mediaDias: media(gapsPorTerr.get(tid) ?? []),
      quadras: ativas.filter((q) => q.territorio_id === tid).length
    }));

  // Conclusões por mês (últimos 12)
  const meses: { mes: string; qtd: number }[] = [];
  const [anoH, mesH] = hoje.split('-').map(Number);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(anoH, mesH - 1 - i, 1, 12);
    meses.push({ mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, qtd: 0 });
  }
  const idxMes = new Map(meses.map((m, i) => [m.mes, i]));
  for (const datas of porQuadra.values())
    for (const d of datas) {
      const i = idxMes.get(d.substring(0, 7));
      if (i !== undefined) meses[i].qtd++;
    }

  // Fim de semana (sáb/dom) vs meio da semana, POR TERRITÓRIO — não faz
  // sentido como número único do sistema inteiro (só diz "no geral
  // trabalha-se mais em dia de semana", óbvio já que são 5 dias contra
  // 2). Contagem simples (sem normalizar por taxa/dia) — quadra pode
  // começar num tipo de dia e terminar no outro, o que importa é o dia
  // da CONCLUSÃO, sem peso nenhum.
  const diaSemanaPorTerr = new Map<string, { fds: number; mds: number }>();
  for (const q of ativas) {
    if (!q.territorio_id) continue;
    const c = diaSemanaPorTerr.get(q.territorio_id) ?? { fds: 0, mds: 0 };
    for (const d of porQuadra.get(q.id) ?? []) (ehFimDeSemana(d) ? c.fds++ : c.mds++);
    diaSemanaPorTerr.set(q.territorio_id, c);
  }
  const diaSemanaPorTerritorio: DiaSemanaTerr[] = [...new Set(ativas.map((q) => q.territorio_id).filter(Boolean) as string[])]
    .sort()
    .map((tid) => {
      const c = diaSemanaPorTerr.get(tid) ?? { fds: 0, mds: 0 };
      return { territorio_id: tid, nome: nomeTerr.get(tid) ?? null, fimDeSemana: c.fds, meioDaSemana: c.mds };
    });

  // Funil do momento
  const desigAbertasIds = new Set((desigAbertas.data ?? []).map((d: any) => d.id));
  const designadas = new Set(dq.filter((l) => desigAbertasIds.has(l.designacao_id)).map((l) => l.quadra_id));
  const emArranjo = await quadrasEmArranjoFuturo(supabase, ativas.map((q) => q.id));
  let qtdDesignadas = 0, qtdArranjo = 0, qtdLivres = 0;
  for (const q of ativas) {
    if (designadas.has(q.id)) qtdDesignadas++;
    else if (emArranjo.has(q.id)) qtdArranjo++;
    else qtdLivres++;
  }

  return {
    totalQuadras: ativas.length,
    totalTerritorios: cicloPorTerritorio.length,
    cobertas12m,
    esquecidas,
    cicloGlobalDias: media(gapsGlobais),
    cicloPorTerritorio,
    conclusoesPorMes: meses,
    diaSemanaPorTerritorio,
    funil: { designadas: qtdDesignadas, arranjo: qtdArranjo, livres: qtdLivres }
  };
}
