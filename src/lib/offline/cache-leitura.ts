// W5: cache de LEITURA em IndexedDB — network-first com fallback pro
// cache. Usado pelos loads universais (+page.ts) das telas convertidas
// na rodada Workers/Offline:
//
//   com rede   → busca fresco, grava no cache, devolve fresco;
//   sem rede   → devolve o último estado conhecido (se houver);
//   rede caiu no meio → idem (fetch rejeitou = fallback).
//
// Por que NÃO stale-while-revalidate (devolver cache na hora e
// revalidar em background): o contrato do load do SvelteKit devolve UMA
// vez — pra atualizar a tela depois seria preciso invalidar de novo
// (risco de loop) ou estado por componente em toda página. Pior: depois
// de uma action, o invalidateAll() reexecuta o load — se devolvêssemos
// cache velho, o usuário não veria a própria edição. Network-first é
// sempre correto; o cache é rede de segurança, não atalho.
//
// DB separado do da fila de escrita (queue.ts) de propósito — evita
// dança de versão no upgrade do IndexedDB existente.
//
// CHAVE SEMPRE inclui o id do usuário (dispositivo compartilhado:
// logout/login de outra pessoa não pode enxergar cache alheio).
const DB_NAME = 'territoryhelper-cache';
const STORE = 'leituras';
const DB_VERSION = 1;

interface EntradaCache {
  chave: string;
  valor: unknown;
  gravadoEm: number;
}

export interface ResultadoComCache<T> {
  valor: T;
  /** true = veio do IndexedDB (offline/fetch falhou), não da rede */
  deCache: boolean;
  /** epoch ms de quando o valor foi buscado da rede */
  gravadoEm: number;
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'chave' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function lerCache<T>(chave: string): Promise<EntradaCache | null> {
  try {
    const db = await abrirDb();
    const entrada = await new Promise<EntradaCache | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(chave);
      req.onsuccess = () => resolve(req.result as EntradaCache | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return entrada ?? null;
  } catch {
    return null;
  }
}

export async function gravarCache(chave: string, valor: unknown): Promise<void> {
  try {
    const db = await abrirDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ chave, valor, gravadoEm: Date.now() } satisfies EntradaCache);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // cache é best-effort — falha de gravação (quota, private mode)
    // nunca pode derrubar o load que já tem o dado fresco na mão.
  }
}

export async function limparCacheLeitura(): Promise<void> {
  try {
    const db = await abrirDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}

export async function comCache<T>(chave: string, fetcher: () => Promise<T>): Promise<ResultadoComCache<T>> {
  // Modo avião declarado: nem tenta a rede. IMPORTANTE porque o
  // supabase-js NÃO lança em erro de rede nas queries cruas (devolve
  // { data: null, error } sem throw) — sem este guard, um load offline
  // poderia "resolver" com listas vazias e ainda GRAVAR isso no cache
  // por cima do dado bom. (Os fetchers também devem começar por um
  // helper que lança — selectAll/listarQuadrasComGeo lançam — pra
  // cobrir o caso da rede cair com onLine ainda true.)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const cached = await lerCache<T>(chave);
    if (cached) return { valor: cached.valor as T, deCache: true, gravadoEm: cached.gravadoEm };
    // sem cache e sem rede: deixa o fetcher falhar com o erro real
  }
  try {
    const valor = await fetcher();
    // fire-and-forget: não atrasa a resposta pra gravar o cache
    void gravarCache(chave, valor);
    return { valor, deCache: false, gravadoEm: Date.now() };
  } catch (e) {
    // HttpError do SvelteKit (error(403)/error(404) do fetcher) = o
    // SERVIDOR/regra disse não — não é problema de rede, NUNCA cai pro
    // cache (senão um publicador que perdeu a designação continuaria
    // abrindo a quadra do cache pra sempre).
    if (e && typeof e === 'object' && 'status' in e) throw e;
    const cached = await lerCache<T>(chave);
    if (cached) return { valor: cached.valor as T, deCache: true, gravadoEm: cached.gravadoEm };
    throw e;
  }
}
