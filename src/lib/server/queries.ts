// Helpers de query que reusam padrões comuns. Mantém os +page.server.ts
// finos e centralizam o tratamento de erro/tipos.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Quadra, Territorio, Profile, Designacao } from '$lib/types';

export interface QuadraEnriquecida extends Quadra {
  territorio_nome: string | null;
  qtd_locais: number;
  qtd_unidades: number;
}

// Lista quadras com nome do território (JOIN) e contagem de locais/unidades.
// Postgres faz tudo numa query — sem N+1.
export async function listarQuadrasComContagem(
  supabase: SupabaseClient
): Promise<QuadraEnriquecida[]> {
  // PostgREST não faz GROUP BY nativo — usamos a view ou contamos no FE.
  // Como ainda não criamos view materializada, fazemos 2 queries paralelas
  // e juntamos. Pra <500 quadras isso ainda é <100ms.
  const [quadrasRes, locaisRes] = await Promise.all([
    supabase
      .from('quadras')
      .select('id, color, territorio_id, status, data_conclusao, notas, criado_em, atualizado_em, territorios(nome)')
      .order('id'),
    supabase.from('locais').select('id, quadra_id')
  ]);

  if (quadrasRes.error) throw quadrasRes.error;
  if (locaisRes.error) throw locaisRes.error;

  const locaisPorQuadra = new Map<string, number>();
  for (const l of locaisRes.data ?? []) {
    if (!l.quadra_id) continue;
    locaisPorQuadra.set(l.quadra_id, (locaisPorQuadra.get(l.quadra_id) ?? 0) + 1);
  }

  return (quadrasRes.data ?? []).map((q: any) => ({
    ...q,
    poly: null, // não trazemos polígono pra lista (é pesado e não usado aqui)
    territorio_nome: q.territorios?.nome ?? null,
    qtd_locais: locaisPorQuadra.get(q.id) ?? 0,
    qtd_unidades: 0 // preenchemos quando a tela precisar
  })) as QuadraEnriquecida[];
}

export async function listarTerritorios(supabase: SupabaseClient): Promise<Territorio[]> {
  const { data, error } = await supabase
    .from('territorios')
    .select('*')
    .order('nome');
  if (error) throw error;
  return (data ?? []) as Territorio[];
}

export async function listarPublicadores(
  supabase: SupabaseClient
): Promise<Pick<Profile, 'id' | 'nome' | 'role'>[]> {
  // Inclui dirigente e admin (também podem receber designação se quiser).
  // Só ativos.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, role')
    .eq('ativo', true)
    .order('nome');
  if (error) throw error;
  return data ?? [];
}

export interface DesignacaoEnriquecida extends Designacao {
  publicador_nome: string | null;
  quadras_ids: string[];
}

export async function listarDesignacoes(
  supabase: SupabaseClient
): Promise<DesignacaoEnriquecida[]> {
  // 3 queries paralelas:
  // 1. designacoes (sem join — designacoes tem 2 FKs pra profiles
  //    [publicador_id + criado_por], que confunde o auto-detect do PostgREST)
  // 2. designacao_quadras (junção)
  // 3. profiles ativos pra resolver nome (memo client-side)
  const [desRes, dqRes, profRes] = await Promise.all([
    supabase.from('designacoes').select('*').order('criada_em', { ascending: false }),
    supabase.from('designacao_quadras').select('designacao_id, quadra_id'),
    supabase.from('profiles').select('id, nome')
  ]);

  if (desRes.error) throw desRes.error;
  if (dqRes.error) throw dqRes.error;
  if (profRes.error) throw profRes.error;

  const quadrasPorDesignacao = new Map<number, string[]>();
  for (const dq of dqRes.data ?? []) {
    const lista = quadrasPorDesignacao.get(dq.designacao_id) ?? [];
    lista.push(dq.quadra_id);
    quadrasPorDesignacao.set(dq.designacao_id, lista);
  }

  const nomePorId = new Map((profRes.data ?? []).map((p) => [p.id, p.nome]));

  return (desRes.data ?? []).map((d: any) => ({
    ...d,
    publicador_nome: d.publicador_id ? nomePorId.get(d.publicador_id) ?? null : null,
    quadras_ids: (quadrasPorDesignacao.get(d.id) ?? []).sort()
  })) as DesignacaoEnriquecida[];
}
