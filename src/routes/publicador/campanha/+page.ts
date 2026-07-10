// W9: load UNIVERSAL no BROWSER (ssr=false) com cache offline — mesma
// receita W3/W4/W5/W8.
import type { PageLoad } from './$types';
import { supabaseBrowser } from '$lib/supabase-browser';
import type { Campanha } from '$lib/types';
import { statusCampanha, type StatusCampanha } from '$lib/campanhas';
import { listarQuadrasComGeo, type QuadraGeo } from '$lib/queries';
import { comCache } from '$lib/offline/cache-leitura';

export const ssr = false;

export interface CampanhaResumo {
  id: number;
  nome: string;
  data_inicio: string;
  data_alvo: string;
  meta_semanal: number | null;
  status: StatusCampanha;
  concluidas_no_periodo: number;
  total_meta: number;
  concluidas_semana: number;
  diasParaComecar: number;
  diasRestantes: number;
  notasSuprimento: string | null;
  imagemUrl: string | null;
}

export interface ConclusaoSemana {
  semana: string;
  qtd: number;
}

export interface MetaPessoal {
  id: number;
  texto: string;
  feito: boolean;
}

export interface MinhaColaboracao {
  porTipo: Record<string, number>;
  cartasEscritas: number;
}

export function chaveCampanhaCampo(userId: string | null): string {
  return `campo:campanha:${userId ?? 'anon'}`;
}

export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  const r = await comCache(chaveCampanhaCampo(profile?.id ?? null), () => carregarCampanhaCampo(profile?.id ?? null));
  return { ...r.valor, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

// Exportada pra ser reusada pelo prefetch da carteira (campo-fetchers.ts)
// — MESMA função, MESMA chave de cache, senão o prefetch não serve pra nada.
export async function carregarCampanhaCampo(minhaId: string | null) {
  const supabase = supabaseBrowser();
  const [ativaRes, objetivosRes, quadras] = await Promise.all([
    supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal, ativa, publicacao_id, publicacoes(imagem_url)')
      .eq('ativa', true)
      .maybeSingle(),
    supabase
      .from('campanha')
      .select('*')
      .eq('publico', true)
      .order('modalidade')
      .order('ordem'),
    listarQuadrasComGeo(supabase)
  ]);

  // Query crua não lança em falha de rede — sem lançar aqui, o comCache
  // gravaria campanha "inexistente" por cima do snapshot bom (ver W5).
  if (ativaRes.error) throw ativaRes.error;
  if (objetivosRes.error) throw objetivosRes.error;

  const c = ativaRes.data as any;

  let ativa: CampanhaResumo | null = null;
  let quadrasConcluidasNoPeriodo: string[] = [];
  let conclusoesSemana: ConclusaoSemana[] = [];
  let metasPessoais: MetaPessoal[] = [];
  let minhaColaboracao: MinhaColaboracao | null = null;

  if (c) {
    const concluidasNoPeriodo = quadras.filter(
      (q) => q.data_conclusao && q.data_conclusao >= c.data_inicio && q.data_conclusao <= c.data_alvo
    );
    quadrasConcluidasNoPeriodo = concluidasNoPeriodo.map((q) => q.id);

    const ha7dias = new Date(Date.now() - 7 * 86400000).toISOString().substring(0, 10);
    const hoje = new Date().toISOString().substring(0, 10);
    const concluidasSemana = quadras.filter(
      (q) => q.data_conclusao && q.data_conclusao >= ha7dias && q.data_conclusao <= hoje && q.data_conclusao >= c.data_inicio
    ).length;
    const diasParaComecar = Math.max(0, Math.ceil(
      (new Date(c.data_inicio + 'T12:00:00').getTime() - Date.now()) / 86400000
    ));
    const diasRestantes = Math.max(0, Math.ceil(
      (new Date(c.data_alvo + 'T12:00:00').getTime() - Date.now()) / 86400000
    ));
    let notasSuprimento: string | null = null;
    if (c.publicacao_id) {
      const { data: supr } = await supabase
        .from('campanha_suprimentos')
        .select('notas')
        .eq('campanha_id', c.id)
        .eq('publicacao_id', c.publicacao_id)
        .maybeSingle();
      notasSuprimento = supr?.notas ?? null;
    }
    ativa = {
      id: c.id,
      nome: c.nome,
      data_inicio: c.data_inicio,
      data_alvo: c.data_alvo,
      meta_semanal: c.meta_semanal,
      status: statusCampanha(c),
      concluidas_no_periodo: concluidasNoPeriodo.length,
      total_meta: quadras.length,
      concluidas_semana: concluidasSemana,
      diasParaComecar,
      diasRestantes,
      notasSuprimento,
      imagemUrl: c.publicacoes?.imagem_url ?? null
    };

    const mapa = new Map<string, number>();
    for (const q of quadras) {
      if (!q.data_conclusao) continue;
      if (q.data_conclusao < c.data_inicio || q.data_conclusao > c.data_alvo) continue;
      const d = new Date(q.data_conclusao + 'T12:00:00');
      const dow = d.getDay() || 7;
      d.setDate(d.getDate() - (dow - 1));
      const key = d.toISOString().substring(0, 10);
      mapa.set(key, (mapa.get(key) || 0) + 1);
    }
    conclusoesSemana = [...mapa].map(([semana, qtd]) => ({ semana, qtd })).sort((a, b) => a.semana.localeCompare(b.semana));

    if (minhaId) {
      const [{ data: metasRows }, { data: registrosRows }, { count: cartasCount }] = await Promise.all([
        supabase
          .from('campanha_metas_pessoais')
          .select('id, texto, feito')
          .eq('campanha_id', c.id)
          .eq('publicador_id', minhaId)
          .order('id'),
        supabase
          .from('registros')
          .select('tipo')
          .eq('publicador_id', minhaId)
          .gte('ts', c.data_inicio)
          .lte('ts', c.data_alvo + 'T23:59:59')
          .not('tipo', 'in', '(desfeito,carta_undo)'),
        supabase
          .from('unidades')
          .select('id', { count: 'exact', head: true })
          .eq('carta_escrita_por', minhaId)
          .gte('carta_entregue', c.data_inicio)
          .lte('carta_entregue', c.data_alvo)
      ]);
      metasPessoais = (metasRows ?? []) as MetaPessoal[];
      const porTipo: Record<string, number> = {};
      for (const r of (registrosRows ?? []) as { tipo: string }[]) {
        porTipo[r.tipo] = (porTipo[r.tipo] ?? 0) + 1;
      }
      minhaColaboracao = { porTipo, cartasEscritas: cartasCount ?? 0 };
    }
  }

  const objetivos = ativa
    ? ((objetivosRes.data ?? []) as any[]).filter(
        (o) => o.campanha_id === ativa!.id || o.campanha_id == null
      )
    : [];

  return {
    ativa, objetivos: objetivos as Campanha[], quadras: quadras as QuadraGeo[],
    quadrasConcluidasNoPeriodo, conclusoesSemana, metasPessoais, minhaColaboracao
  };
}
