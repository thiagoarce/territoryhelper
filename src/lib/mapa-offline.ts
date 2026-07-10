// E4 (W11): mapa de FUNDO offline via PMTiles.
//
// Modelo: o admin gera um extract vetorial do município (arquivo
// .pmtiles único — ver scripts/gerar-mapa-offline.md) e sobe no bucket
// público `mapa-offline` (migration 079). O publicador baixa esse
// arquivo UMA vez (Perfil → Offline → Baixar mapa) — ele fica em
// IndexedDB — e, quando o app está SEM internet, os componentes de mapa
// trocam o estilo do OpenFreeMap por um estilo local que lê os tiles do
// arquivo baixado (protocolo pmtiles:// do MapLibre).
//
// Invariante de segurança visual: ONLINE nada muda — a troca de estilo
// só acontece com navigator.onLine === false E arquivo baixado. Sem
// arquivo, offline fica como hoje (fundo vazio, overlays desenham).
//
// Glifos (fontes dos rótulos): o MapLibre busca por HTTP — offline isso
// falharia. No download do mapa também baixamos os ranges latinos das
// fontes Noto Sans usadas pelo estilo e servimos via protocolo próprio
// (thassets://) lendo do IndexedDB. Range não baixado (texto fora do
// latino) só perde o rótulo, não quebra o mapa. Sprite (ícones de POI)
// foi omitido de propósito: o fundo não precisa deles e evita mais
// download.
// maplibre-gl e pmtiles entram por import DINÂMICO (SSR-safe e não pesa
// o bundle de quem só lê a meta, como /perfil); @protomaps/basemaps é
// puro-dados, pode ser estático.
import { layers, namedFlavor } from '@protomaps/basemaps';
import { supabaseBrowser } from '$lib/supabase-browser';

const ARQUIVO = 'municipio.pmtiles';

function urlArquivoBucket(): string {
  return supabaseBrowser().storage.from('mapa-offline').getPublicUrl(ARQUIVO).data.publicUrl;
}

const CHAVE_META = 'territoryhelper:mapa-offline';
const DB_NAME = 'territoryhelper-mapa';
const DB_VERSION = 1;
const STORE_ARQUIVO = 'arquivo';
const STORE_GLIFOS = 'glifos';

// Fontes/ranges que o estilo light do protomaps usa pra rótulos latinos.
const FONTES = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
const RANGES = ['0-255', '256-511'];
const URL_GLIFOS_CDN = 'https://protomaps.github.io/basemaps-assets/fonts';

export interface MetaMapaOffline {
  bytes: number;
  baixadoEm: number;
}

export function metaMapaOffline(): MetaMapaOffline | null {
  try {
    const v = localStorage.getItem(CHAVE_META);
    return v ? (JSON.parse(v) as MetaMapaOffline) : null;
  } catch {
    return null;
  }
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ARQUIVO)) db.createObjectStore(STORE_ARQUIVO);
      if (!db.objectStoreNames.contains(STORE_GLIFOS)) db.createObjectStore(STORE_GLIFOS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function gravar(store: string, chave: string, valor: unknown): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(valor, chave);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function ler<T>(store: string, chave: string): Promise<T | null> {
  const db = await abrirDb();
  const v = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(chave);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return v ?? null;
}

async function limparStores(): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_ARQUIVO, STORE_GLIFOS], 'readwrite');
    tx.objectStore(STORE_ARQUIVO).clear();
    tx.objectStore(STORE_GLIFOS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// === Download / remoção (Perfil → Offline) ===

export async function baixarMapaOffline(onProgresso?: (fracao: number | null) => void): Promise<void> {
  const res = await fetch(urlArquivoBucket());
  if (!res.ok) throw new Error(res.status === 404 || res.status === 400
    ? 'O arquivo de mapa ainda não foi publicado pelo admin (bucket mapa-offline).'
    : `Falhou baixar o mapa (${res.status})`);

  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body?.getReader();
  let blob: Blob;
  if (reader) {
    const partes: BlobPart[] = [];
    let lidos = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      partes.push(value);
      lidos += value.byteLength;
      onProgresso?.(total > 0 ? lidos / total : null);
    }
    blob = new Blob(partes);
  } else {
    blob = await res.blob();
  }
  await gravar(STORE_ARQUIVO, ARQUIVO, blob);

  // Glifos latinos (best-effort — falha de um range não aborta o mapa)
  for (const fonte of FONTES) {
    for (const range of RANGES) {
      try {
        const g = await fetch(`${URL_GLIFOS_CDN}/${encodeURIComponent(fonte)}/${range}.pbf`);
        if (g.ok) await gravar(STORE_GLIFOS, `${fonte}/${range}`, await g.arrayBuffer());
      } catch {
        // segue — rótulo daquele range só não aparece offline
      }
    }
  }

  try {
    localStorage.setItem(CHAVE_META, JSON.stringify({ bytes: blob.size, baixadoEm: Date.now() } satisfies MetaMapaOffline));
  } catch {}
  // O arquivo mudou — descarta a instância registrada pra recarregar.
  pmtilesPronto = null;
}

export async function removerMapaOffline(): Promise<void> {
  await limparStores();
  try { localStorage.removeItem(CHAVE_META); } catch {}
  pmtilesPronto = null;
}

// === Protocolos MapLibre (pmtiles + glifos locais) ===

let protocolo: any = null;
let pmtilesPronto: Promise<boolean> | null = null;

// Registra os protocolos no MapLibre — DONO ÚNICO do scheme 'pmtiles'
// (addProtocol é global e o último registro ganha; nenhum componente de
// mapa deve registrar o seu próprio, senão desliga o offline).
export async function registrarProtocolosDeMapa(): Promise<any> {
  if (protocolo) return protocolo;
  const maplibreModule: any = await import('maplibre-gl');
  const maplibre = maplibreModule.default ?? maplibreModule;
  const { Protocol } = await import('pmtiles');
  protocolo = new Protocol();
  maplibre.addProtocol('pmtiles', protocolo.tile.bind(protocolo));
  // Glifos servidos do IndexedDB: thassets://fonts/<fontstack>/<range>.pbf
  maplibre.addProtocol('thassets', async (params: { url: string }) => {
    const m = params.url.match(/^thassets:\/\/fonts\/([^/]+)\/([^/.]+)\.pbf$/);
    const chave = m ? `${decodeURIComponent(m[1])}/${m[2]}` : null;
    const buf = chave ? await ler<ArrayBuffer>(STORE_GLIFOS, chave) : null;
    if (buf) return { data: buf };
    // range não baixado: devolve pbf vazio (rótulo some, mapa não quebra)
    return { data: new ArrayBuffer(0) };
  });
  return protocolo;
}

// Carrega o blob do IndexedDB e registra no protocolo pmtiles.
// Idempotente (uma promise única) — pode ser chamado de vários mapas.
export function prepararMapaOffline(): Promise<boolean> {
  if (pmtilesPronto) return pmtilesPronto;
  pmtilesPronto = (async () => {
    if (!metaMapaOffline()) return false;
    const blob = await ler<Blob>(STORE_ARQUIVO, ARQUIVO);
    if (!blob) return false;
    const proto = await registrarProtocolosDeMapa();
    const { PMTiles, FileSource } = await import('pmtiles');
    proto.add(new PMTiles(new FileSource(new File([blob], ARQUIVO))));
    return true;
  })().catch(() => {
    pmtilesPronto = null;
    return false;
  });
  return pmtilesPronto;
}

function estiloOffline(): any {
  return {
    version: 8,
    glyphs: 'thassets://fonts/{fontstack}/{range}.pbf',
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${ARQUIVO}`,
        attribution: '© OpenStreetMap'
      }
    },
    layers: layers('protomaps', namedFlavor('light'), { lang: 'pt' })
  };
}

// Decisor central usado pelos componentes de mapa na CONSTRUÇÃO:
// online → a URL de sempre (zero mudança de comportamento);
// offline com arquivo baixado → estilo local pmtiles.
export async function estiloDoMapa(urlOnline: string): Promise<any> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return urlOnline;
  const ok = await prepararMapaOffline();
  return ok ? estiloOffline() : urlOnline;
}
