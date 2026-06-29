// Helpers de query que reusam padrões comuns. Mantém os +page.server.ts
// finos e centralizam o tratamento de erro/tipos.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Quadra, Territorio, Profile, Designacao, Local, Unidade, TipoRegistro } from '$lib/types';

// ============================================================================
// IMPORTANTE: Supabase tem limite default de 1000 rows por query.
// Em tabelas grandes (locais, unidades, registros) sempre use selectAll
// pra evitar bug silencioso onde só os primeiros 1000 retornam.
// ============================================================================

const PAGE = 1000;

export async function selectAll<T = unknown>(
  query: any
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query.range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

// Conta locais por quadra (paginado pra evitar bug do limite 1000).
export async function contarLocaisPorQuadra(supabase: SupabaseClient): Promise<Map<string, number>> {
  const linhas = await selectAll<{ quadra_id: string | null }>(
    supabase.from('locais').select('quadra_id')
  );
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    if (!l.quadra_id) continue;
    mapa.set(l.quadra_id, (mapa.get(l.quadra_id) ?? 0) + 1);
  }
  return mapa;
}

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
  const [quadrasRes, locaisPorQuadra] = await Promise.all([
    supabase
      .from('quadras')
      .select('id, color, territorio_id, status, data_conclusao, notas, criado_em, atualizado_em, territorios(nome)')
      .order('id'),
    contarLocaisPorQuadra(supabase)
  ]);

  if (quadrasRes.error) throw quadrasRes.error;

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
  const [qRes, locaisPorQuadra, terrRes] = await Promise.all([
    supabase
      .from('quadras_geo')
      .select('id, color, territorio_id, status, data_conclusao, notas, poly_geojson')
      .order('id'),
    contarLocaisPorQuadra(supabase),
    supabase.from('territorios').select('id, nome')
  ]);
  if (qRes.error) throw qRes.error;
  if (terrRes.error) throw terrRes.error;

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
  // Paginação obrigatória pra unidades (19k+ no banco) e pra prédios
  // (potencialmente 2774 — passa do limite default).
  const [predios, unidades] = await Promise.all([
    selectAll<any>(
      supabase
        .from('locais')
        .select('id, logradouro, numero, nome, quadra_id, tipo_entrada, acesso_caixas, acesso_interfones, irmao_mora')
        .eq('tipo', 'predio')
        .order('logradouro')
    ),
    selectAll<{ local_id: number; carta_entregue: string | null; desocupado: boolean; nao_escrever: boolean }>(
      supabase.from('unidades').select('local_id, carta_entregue, desocupado, nao_escrever')
    )
  ]);

  type Counts = { qtd: number; carta: number; desoc: number; naoescr: number };
  const porLocal = new Map<number, Counts>();
  for (const u of unidades) {
    const c = porLocal.get(u.local_id) ?? { qtd: 0, carta: 0, desoc: 0, naoescr: 0 };
    c.qtd++;
    if (u.carta_entregue) c.carta++;
    if (u.desocupado) c.desoc++;
    if (u.nao_escrever) c.naoescr++;
    porLocal.set(u.local_id, c);
  }
  return predios.map((p: any) => {
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
  // Pega quadra do BASE table (sem view) — mais resiliente.
  const [qBase, profRes, terrRes] = await Promise.all([
    supabase
      .from('quadras')
      .select('id, color, territorio_id, status')
      .eq('id', quadraId)
      .maybeSingle(),
    supabase.from('profiles').select('id, nome'),
    supabase.from('territorios').select('id, nome')
  ]);

  if (qBase.error) {
    console.error('[carregarQuadraComLocais] erro buscando quadra:', quadraId, qBase.error.message);
    throw qBase.error;
  }
  if (!qBase.data) {
    console.warn('[carregarQuadraComLocais] quadra não encontrada:', quadraId);
    return null;
  }
  if (profRes.error) throw profRes.error;
  if (terrRes.error) throw terrRes.error;

  // Geo da quadra (view) — graceful degradation se view não existe
  let polyGeoJson: unknown = null;
  try {
    const { data: geoData, error: geoErr } = await supabase
      .from('quadras_geo')
      .select('poly_geojson')
      .eq('id', quadraId)
      .maybeSingle();
    if (geoErr) {
      console.warn('[quadras_geo] erro:', geoErr.message);
    } else {
      polyGeoJson = geoData?.poly_geojson ?? null;
    }
  } catch (e) {
    console.warn('[quadras_geo] exception:', e);
  }

  // Locais da quadra (paginado pra evitar limite 1000)
  let locais: Local[] = [];
  try {
    locais = await selectAll<Local>(
      supabase.from('locais_geo').select('*').eq('quadra_id', quadraId).order('id')
    );
  } catch (e) {
    console.warn('[locais_geo] exception, fallback pra tabela base:', e);
    locais = await selectAll<Local>(
      supabase.from('locais').select('*').eq('quadra_id', quadraId).order('id')
    );
  }

  const territorioNomePorId = new Map((terrRes.data ?? []).map((t) => [t.id, t.nome]));

  if (locais.length === 0) {
    return {
      quadra: {
        ...(qBase.data as any),
        poly_geojson: polyGeoJson,
        territorio_nome: qBase.data.territorio_id ? territorioNomePorId.get(qBase.data.territorio_id) ?? null : null
      },
      locais: []
    };
  }

  const localIds = locais.map((l) => l.id);
  // Unidades paginadas (em quadras grandes pode passar de 1000)
  const unidades = await selectAll<Unidade>(
    supabase
      .from('unidades')
      .select('*')
      .in('local_id', localIds)
      .order('ordem', { ascending: true, nullsFirst: false })
      .order('complemento')
  );

  // Registros paginados
  const unidadeIds = unidades.map((u) => u.id);
  let registros: { unidade_id: number; tipo: string; ts: string; publicador_id: string | null }[] = [];
  if (unidadeIds.length > 0) {
    registros = await selectAll(
      supabase
        .from('registros')
        .select('unidade_id, tipo, ts, publicador_id')
        .in('unidade_id', unidadeIds)
        .order('ts', { ascending: false })
    );
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

  return {
    quadra: {
      ...(qBase.data as any),
      poly_geojson: geoRes.data?.poly_geojson ?? null,
      territorio_nome: qBase.data.territorio_id ? territorioNomePorId.get(qBase.data.territorio_id) ?? null : null
    },
    locais: locaisEnriquecidos
  };
}
