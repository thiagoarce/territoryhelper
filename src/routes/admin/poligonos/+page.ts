// W4: load UNIVERSAL no BROWSER (ssr=false) — este era o load mais
// pesado do app inteiro: ~19k locais_geo via selectAll (19+ requests
// paginadas) + quadras+geo + territórios + TCEs + curadoria, TUDO
// reprocessado a cada um dos 25 invalidateAll() da tela. No browser
// não há limite de CPU; o Worker não vê mais nenhuma leitura desta
// rota. Actions continuam em +page.server.ts. Ver o diagnóstico em
// docs/specs-workers-offline.md.
import type { PageLoad } from "./$types";
import { supabaseBrowser } from "$lib/supabase-browser";
import {
  selectAll,
  listarQuadrasComGeo,
  listarPublicadores,
} from "$lib/queries";
import { comCache } from "$lib/offline/cache-leitura";

export const ssr = false;

export interface LocalComGeo {
  id: number;
  tipo: string;
  logradouro: string;
  numero: string;
  setor: string | null;
  quadra_ibge: string | null;
  face_ibge: string | null;
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
  face_ibge: string | null;
  quadra_id: string | null;
  geo_geojson: { coordinates: [number, number] } | null;
}

export interface CuradoriaLinha {
  id: number;
  local_id: number | null;
  unidade_id: number | null;
  publicador_id: string | null;
  publicador_nome: string | null;
  tipo: "edicao" | "criacao" | "nao_existe";
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  criado_em: string;
  // Endereço pra dar contexto (pode ser null se o local já foi excluído por fora)
  local_endereco: string | null;
}

export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  // W5: network-first com fallback pro cache (offline abre com o último
  // estado; edições continuam pedindo rede — são actions).
  const r = await comCache(`admin:poligonos:${profile?.id ?? "anon"}`, () =>
    carregar(),
  );
  return {
    ...r.valor,
    cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm },
  };
};

async function carregar() {
  const supabase = supabaseBrowser();
  // As coleções são independentes. Em instalações grandes, executá-las em
  // paralelo evita somar a latência das várias páginas de locais e quadras.
  const [
    linhas,
    quadras,
    terrRes,
    tceRes,
    publicadores,
    curadoriaRes,
  ] = await Promise.all([
    selectAll<LocalDaView>(
      supabase
        .from("locais_geo")
        .select(
          "id, tipo, logradouro, numero, setor, quadra_ibge, face_ibge, quadra_id, geo_geojson",
        )
        .not("geo_geojson", "is", null)
        .order("id"),
    ),
    listarQuadrasComGeo(supabase, true),
    supabase.from("territorios").select("id, nome, cor").order("nome"),
    supabase
      .from("tces_geo")
      .select("id, nome, tipo, status, prazo, publicador_id, poly_geojson")
      .order("criado_em", { ascending: false }),
    listarPublicadores(supabase),
    supabase
      .from("curadoria_edicoes")
      .select(
        "id, local_id, unidade_id, publicador_id, tipo, antes, depois, criado_em",
      )
      .eq("status", "pendente")
      .order("criado_em", { ascending: false }),
  ]);
  if (terrRes.error) throw terrRes.error;
  if (tceRes.error) throw tceRes.error;
  if (curadoriaRes.error) throw curadoriaRes.error;
  const terrRows = terrRes.data ?? [];
  const tceRows = tceRes.data ?? [];
  const curadoriaRows = curadoriaRes.data ?? [];

  // TODOS os locais com geo (extrai lat/lng do geo_geojson da view)
  const locais: LocalComGeo[] = linhas
    .map((l) => {
      const c = l.geo_geojson?.coordinates;
      return {
        id: l.id,
        tipo: l.tipo,
        logradouro: l.logradouro,
        numero: l.numero,
        setor: l.setor,
        quadra_ibge: l.quadra_ibge,
        face_ibge: l.face_ibge,
        quadra_id: l.quadra_id,
        lat: c ? c[1] : null,
        lng: c ? c[0] : null,
      };
    })
    .filter((l) => l.lat != null && l.lng != null);

  // Lista de territórios (pra select no modo Quadras + colorir por território)
  const qtdPorTerritorio = new Map<string, number>();
  for (const q of quadras) {
    if (q.territorio_id)
      qtdPorTerritorio.set(
        q.territorio_id,
        (qtdPorTerritorio.get(q.territorio_id) ?? 0) + 1,
      );
  }
  const territorios = terrRows.map((t: any) => ({
    id: t.id,
    nome: t.nome,
    cor: t.cor,
    qtd: qtdPorTerritorio.get(t.id) ?? 0,
  })) as { id: string; nome: string; cor: string | null; qtd: number }[];

  // TCEs existentes (com polígono pra desenhar no mapa) + nome do publicador
  const nomePub = new Map(publicadores.map((p) => [p.id, p.nome]));
  const tces = tceRows.map((t: any) => ({
    id: t.id,
    nome: t.nome,
    tipo: t.tipo,
    status: t.status,
    prazo: t.prazo,
    publicador_id: t.publicador_id,
    publicador_nome: t.publicador_id
      ? (nomePub.get(t.publicador_id) ?? null)
      : null,
    poly_geojson: t.poly_geojson,
  })) as {
    id: string;
    nome: string;
    tipo: string;
    status: string;
    prazo: string | null;
    publicador_id: string | null;
    publicador_nome: string | null;
    poly_geojson: unknown | null;
  }[];

  // Quadras pra UI de renomeio
  const quadrasParaRenomear = quadras.map((q) => ({
    id: q.id,
    color: q.color,
    status: q.status,
  }));

  // Distribuição setor|quadra_ibge por quadra (pra detectar inconsistências)
  const clusterPorQuadra = new Map<string, Map<string, number>>();
  // A20: pra cada cluster (setor|quadra_ibge), quais quadra_id têm locais
  // com esse cluster — usado pra sugerir "essa faixa parece ser da quadra
  // X" quando um cluster minoritário aparece em outra quadra também.
  const quadraIdsPorCluster = new Map<string, Set<string>>();
  // U11: endereços (id/endereco/lat/lng) de cada cluster dentro da
  // quadra — sem isso o admin não consegue auditar visualmente (só via
  // Street View) se um cluster minoritário realmente pertence aqui.
  const locaisPorClusterPorQuadra = new Map<
    string,
    Map<string, LocalComGeo[]>
  >();
  for (const l of locais) {
    if (!l.quadra_id) continue;
    const cluster = `${l.setor || ""}|${l.quadra_ibge || ""}`;
    if (!clusterPorQuadra.has(l.quadra_id))
      clusterPorQuadra.set(l.quadra_id, new Map());
    const m = clusterPorQuadra.get(l.quadra_id)!;
    m.set(cluster, (m.get(cluster) || 0) + 1);
    if (!quadraIdsPorCluster.has(cluster))
      quadraIdsPorCluster.set(cluster, new Set());
    quadraIdsPorCluster.get(cluster)!.add(l.quadra_id);
    if (!locaisPorClusterPorQuadra.has(l.quadra_id))
      locaisPorClusterPorQuadra.set(l.quadra_id, new Map());
    const mLocais = locaisPorClusterPorQuadra.get(l.quadra_id)!;
    if (!mLocais.has(cluster)) mLocais.set(cluster, []);
    mLocais.get(cluster)!.push(l);
  }
  const quadrasMultiCluster: {
    quadra_id: string;
    clusters: {
      cluster: string;
      qtd: number;
      quadrasVizinhas: string[];
      enderecos: {
        id: number;
        endereco: string;
        lat: number | null;
        lng: number | null;
      }[];
    }[];
  }[] = [];
  for (const [qid, m] of clusterPorQuadra) {
    if (m.size > 1) {
      const clusters = [...m]
        .map(([cluster, qtd]) => ({
          cluster,
          qtd,
          quadrasVizinhas: [...(quadraIdsPorCluster.get(cluster) ?? [])].filter(
            (id) => id !== qid,
          ),
          enderecos: (
            locaisPorClusterPorQuadra.get(qid)?.get(cluster) ?? []
          ).map((l) => ({
            id: l.id,
            endereco: `${l.logradouro}, ${l.numero}`,
            lat: l.lat,
            lng: l.lng,
          })),
        }))
        .sort((a, b) => b.qtd - a.qtd);
      quadrasMultiCluster.push({ quadra_id: qid, clusters });
    }
  }
  quadrasMultiCluster.sort((a, b) => a.quadra_id.localeCompare(b.quadra_id));

  const idsComLocais = new Set(clusterPorQuadra.keys());
  const quadrasVazias = quadras
    .filter((q) => !idsComLocais.has(q.id) && q.ativa)
    .map((q) => q.id);

  // Quadras órfãs: ativas sem território (apitam no Auditar)
  const quadrasOrfas = quadras
    .filter((q) => q.ativa && !q.territorio_id)
    .map((q) => q.id);

  // A20: endereços sem face IBGE — auditoria acionável (foca + manda pro
  // modo Vincular pra reatribuir a quadra).
  const locaisSemFace = locais
    .filter((l) => !l.face_ibge)
    .map((l) => ({
      id: l.id,
      endereco: `${l.logradouro}, ${l.numero}`.trim(),
      quadra_id: l.quadra_id,
    }));

  // T12 (A6): curadoria — edições/criações de não-admin pendentes de revisão.
  const localIdsCuradoria = Array.from(
    new Set(
      curadoriaRows
        .map((c: any) => c.local_id)
        .filter((v: any): v is number => v != null),
    ),
  );
  const enderecoPorLocal = new Map<number, string>();
  if (localIdsCuradoria.length > 0) {
    const { data: locaisCurad } = await supabase
      .from("locais")
      .select("id, logradouro, numero, nome")
      .in("id", localIdsCuradoria);
    for (const l of (locaisCurad ?? []) as any[]) {
      enderecoPorLocal.set(
        l.id,
        l.nome || `${l.logradouro ?? ""}, ${l.numero ?? ""}`.trim(),
      );
    }
  }
  const curadoria: CuradoriaLinha[] = curadoriaRows.map((c: any) => ({
    id: c.id,
    local_id: c.local_id,
    unidade_id: c.unidade_id,
    publicador_id: c.publicador_id,
    publicador_nome: c.publicador_id
      ? (nomePub.get(c.publicador_id) ?? null)
      : null,
    tipo: c.tipo,
    antes: c.antes,
    depois: c.depois,
    criado_em: c.criado_em,
    local_endereco:
      c.local_id != null ? (enderecoPorLocal.get(c.local_id) ?? null) : null,
  }));

  return {
    locais,
    quadras,
    territorios,
    tces,
    publicadores,
    quadrasMultiCluster,
    quadrasVazias,
    quadrasOrfas,
    locaisSemFace,
    quadrasParaRenomear,
    curadoria,
  };
}
