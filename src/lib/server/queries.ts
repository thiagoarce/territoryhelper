// Helpers de query que reusam padrões comuns. Mantém os +page.server.ts
// finos e centralizam o tratamento de erro/tipos.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Quadra, Territorio, Profile, Designacao, Local, Unidade, TipoRegistro } from '$lib/types';

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

// Mesma forma das quadras enriquecidas mas COM poly_geojson (pesado — só pra mapa)
export interface QuadraGeo extends QuadraEnriquecida {
  poly_geojson: unknown | null;
}

export async function listarQuadrasComGeo(
  supabase: SupabaseClient
): Promise<QuadraGeo[]> {
  const [qRes, locRes, terrRes] = await Promise.all([
    supabase
      .from('quadras_geo')
      .select('id, color, territorio_id, status, data_conclusao, notas, poly_geojson')
      .order('id'),
    supabase.from('locais').select('id, quadra_id'),
    supabase.from('territorios').select('id, nome')
  ]);
  if (qRes.error) throw qRes.error;
  if (locRes.error) throw locRes.error;
  if (terrRes.error) throw terrRes.error;

  const locaisPorQuadra = new Map<string, number>();
  for (const l of locRes.data ?? []) {
    if (!l.quadra_id) continue;
    locaisPorQuadra.set(l.quadra_id, (locaisPorQuadra.get(l.quadra_id) ?? 0) + 1);
  }
  const territorioNomePorId = new Map((terrRes.data ?? []).map((t) => [t.id, t.nome]));
  return (qRes.data ?? []).map((q: any) => ({
    ...q,
    poly: null,
    territorio_nome: q.territorio_id ? territorioNomePorId.get(q.territorio_id) ?? null : null,
    qtd_locais: locaisPorQuadra.get(q.id) ?? 0,
    qtd_unidades: 0
  })) as QuadraGeo[];
}

// Lista de prédios (locais tipo='predio') com contagens.
// Usado pelas telas de Cartas.
export interface PredioListado {
  id: number;
  logradouro: string;
  numero: string;
  nome: string | null;
  quadra_id: string | null;
  tipo_entrada: string | null;
  acesso_caixas: boolean;
  acesso_interfones: boolean;
  irmao_mora: boolean;
  qtd_aptos: number;
  qtd_carta_entregue: number;
  qtd_desocupado: number;
  qtd_nao_escrever: number;
}

export async function listarPredios(supabase: SupabaseClient): Promise<PredioListado[]> {
  const [predRes, uniRes] = await Promise.all([
    supabase
      .from('locais')
      .select('id, logradouro, numero, nome, quadra_id, tipo_entrada, acesso_caixas, acesso_interfones, irmao_mora')
      .eq('tipo', 'predio')
      .order('logradouro'),
    supabase
      .from('unidades')
      .select('local_id, carta_entregue, desocupado, nao_escrever')
  ]);
  if (predRes.error) throw predRes.error;
  if (uniRes.error) throw uniRes.error;

  type Counts = { qtd: number; carta: number; desoc: number; naoescr: number };
  const porLocal = new Map<number, Counts>();
  for (const u of uniRes.data ?? []) {
    const c = porLocal.get(u.local_id) ?? { qtd: 0, carta: 0, desoc: 0, naoescr: 0 };
    c.qtd++;
    if (u.carta_entregue) c.carta++;
    if (u.desocupado) c.desoc++;
    if (u.nao_escrever) c.naoescr++;
    porLocal.set(u.local_id, c);
  }
  return (predRes.data ?? []).map((p: any) => {
    const c = porLocal.get(p.id) ?? { qtd: 0, carta: 0, desoc: 0, naoescr: 0 };
    return {
      ...p,
      qtd_aptos: c.qtd,
      qtd_carta_entregue: c.carta,
      qtd_desocupado: c.desoc,
      qtd_nao_escrever: c.naoescr
    } as PredioListado;
  });
}

export interface PredioDetalhado extends PredioListado {
  nome_irmao: string | null;
  notas: string | null;
  geo_geojson: unknown | null;
  unidades: Unidade[];
}

export async function carregarPredioDetalhado(
  supabase: SupabaseClient,
  predioId: number
): Promise<PredioDetalhado | null> {
  const [pRes, uRes] = await Promise.all([
    supabase
      .from('locais_geo')
      .select('*')
      .eq('id', predioId)
      .eq('tipo', 'predio')
      .maybeSingle(),
    supabase
      .from('unidades')
      .select('*')
      .eq('local_id', predioId)
      .order('ordem', { ascending: true, nullsFirst: false })
      .order('complemento')
  ]);
  if (pRes.error) throw pRes.error;
  if (!pRes.data) return null;
  if (uRes.error) throw uRes.error;
  const p = pRes.data as any;
  const unidades = (uRes.data ?? []) as Unidade[];
  const stats = unidades.reduce(
    (acc, u) => ({
      qtd_aptos: acc.qtd_aptos + 1,
      qtd_carta_entregue: acc.qtd_carta_entregue + (u.carta_entregue ? 1 : 0),
      qtd_desocupado: acc.qtd_desocupado + (u.desocupado ? 1 : 0),
      qtd_nao_escrever: acc.qtd_nao_escrever + (u.nao_escrever ? 1 : 0)
    }),
    { qtd_aptos: 0, qtd_carta_entregue: 0, qtd_desocupado: 0, qtd_nao_escrever: 0 }
  );
  return { ...p, ...stats, unidades } as PredioDetalhado;
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

// ============================================================================
// Dados pra tela de trabalho da quadra (publicador)
// ============================================================================

export interface UnidadeEnriquecida extends Unidade {
  ultimo_tipo: TipoRegistro | string | null;
  ultimo_ts: string | null;
  ultimo_publicador_nome: string | null;
}

export interface LocalComUnidades extends Local {
  unidades: UnidadeEnriquecida[];
}

export interface DadosQuadraTrabalho {
  quadra: Pick<Quadra, 'id' | 'color' | 'territorio_id' | 'status'> & {
    territorio_nome: string | null;
    poly_geojson: unknown | null;
  };
  locais: LocalComUnidades[];
}

export async function carregarQuadraComLocais(
  supabase: SupabaseClient,
  quadraId: string
): Promise<DadosQuadraTrabalho | null> {
  // Em paralelo: quadra com geo (via view quadras_geo) + locais com geo +
  // profiles pra resolver nomes em registros.
  // Note: NÃO fazemos embedded join 'territorios(nome)' em quadras_geo —
  // PostgREST não infere FK de views. Carregamos territorio separado.
  const [qRes, locRes, profRes, terrRes] = await Promise.all([
    supabase
      .from('quadras_geo')
      .select('id, color, territorio_id, status, poly_geojson')
      .eq('id', quadraId)
      .maybeSingle(),
    supabase
      .from('locais_geo')
      .select('*')
      .eq('quadra_id', quadraId)
      .order('id'),
    supabase.from('profiles').select('id, nome'),
    supabase.from('territorios').select('id, nome')
  ]);

  if (qRes.error) throw qRes.error;
  if (!qRes.data) return null;
  if (locRes.error) throw locRes.error;
  if (profRes.error) throw profRes.error;
  if (terrRes.error) throw terrRes.error;

  const territorioNomePorId = new Map((terrRes.data ?? []).map((t) => [t.id, t.nome]));

  const locais = (locRes.data ?? []) as Local[];
  if (locais.length === 0) {
    return {
      quadra: { ...(qRes.data as any), territorio_nome: (qRes.data as any).territorios?.nome ?? null },
      locais: []
    };
  }

  const localIds = locais.map((l) => l.id);
  const { data: unidadesData, error: errUni } = await supabase
    .from('unidades')
    .select('*')
    .in('local_id', localIds)
    .order('ordem', { ascending: true, nullsFirst: false })
    .order('complemento');
  if (errUni) throw errUni;
  const unidades = (unidadesData ?? []) as Unidade[];

  // Último registro por unidade (1 query, ordena DESC, dedup client-side)
  const unidadeIds = unidades.map((u) => u.id);
  let registros: { unidade_id: number; tipo: string; ts: string; publicador_id: string | null }[] = [];
  if (unidadeIds.length > 0) {
    const { data: regData, error: errReg } = await supabase
      .from('registros')
      .select('unidade_id, tipo, ts, publicador_id')
      .in('unidade_id', unidadeIds)
      .order('ts', { ascending: false });
    if (errReg) throw errReg;
    registros = regData ?? [];
  }

  const ultimoPorUnidade = new Map<number, { tipo: string; ts: string; publicador_id: string | null }>();
  for (const r of registros) {
    if (!ultimoPorUnidade.has(r.unidade_id)) ultimoPorUnidade.set(r.unidade_id, r);
  }

  const nomePorId = new Map((profRes.data ?? []).map((p) => [p.id, p.nome]));

  const unidadesPorLocal = new Map<number, UnidadeEnriquecida[]>();
  for (const u of unidades) {
    const ult = ultimoPorUnidade.get(u.id);
    const enriq: UnidadeEnriquecida = {
      ...u,
      ultimo_tipo: ult?.tipo ?? null,
      ultimo_ts: ult?.ts ?? null,
      ultimo_publicador_nome: ult?.publicador_id ? nomePorId.get(ult.publicador_id) ?? null : null
    };
    const arr = unidadesPorLocal.get(u.local_id) ?? [];
    arr.push(enriq);
    unidadesPorLocal.set(u.local_id, arr);
  }

  const locaisEnriquecidos: LocalComUnidades[] = locais.map((l) => ({
    ...l,
    unidades: unidadesPorLocal.get(l.id) ?? []
  }));

  // Ordena por face IBGE (numérico se possível)
  locaisEnriquecidos.sort((a, b) => {
    const fa = parseInt(a.face_ibge || '999', 10);
    const fb = parseInt(b.face_ibge || '999', 10);
    if (isNaN(fa) && isNaN(fb)) return (a.face_ibge || '').localeCompare(b.face_ibge || '');
    if (isNaN(fa)) return 1;
    if (isNaN(fb)) return -1;
    return fa - fb;
  });

  const q: any = qRes.data;
  return {
    quadra: {
      ...q,
      territorio_nome: q.territorio_id ? territorioNomePorId.get(q.territorio_id) ?? null : null
    },
    locais: locaisEnriquecidos
  };
}
