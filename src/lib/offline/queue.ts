// Fila de escrita offline — IndexedDB puro (sem lib), pra sobreviver a
// reload/fechar app enquanto sem sinal. Guarda o suficiente pra repetir o
// POST exato quando a conexão voltar: URL da action + entries do FormData.
//
// W10 ("fila 2.0"): cada item também guarda uma DESCRIÇÃO legível (pro
// publicador entender o que está pendente numa tela de revisão) e um
// STATUS. `pendente` = ainda não tentou (ou só falhou por falta de rede,
// tenta de novo sozinho). `erro` = chegou ao servidor e foi recusado
// (RLS/validação) — fica na fila pro publicador decidir (tentar de novo
// ou descartar) em vez de sumir silenciosamente, que escondia perda de
// dado de campo.
const DB_NAME = 'territoryhelper-offline';
const STORE = 'fila_escrita';
const DB_VERSION = 2;

export type StatusItemFila = 'pendente' | 'erro';

export interface ItemFila {
  id: number;
  url: string;
  entries: [string, string][];
  descricao: string;
  status: StatusItemFila;
  erro: string | null;
  /** uid de quem enfileirou — item de A não é replayado na sessão de B
   *  (aparelho compartilhado); null = item legado, tratado como do atual */
  uid: string | null;
  criadoEm: number;
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
      // v1→v2: itens antigos (sem descricao/status) continuam lidos —
      // as funções abaixo tratam `undefined` como pendente/sem descrição.
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// FormData só serializa como string aqui — não cobre upload de arquivo
// (uso de campo, os fluxos offline são todos texto: ids, tipos, datas).
export async function enfileirar(url: string, formData: FormData, descricao: string, uid: string | null): Promise<void> {
  // `.entries()` existe no FormData do browser (onde este módulo roda) —
  // o cast contorna o tipo de FormData do @cloudflare/workers-types (mais
  // enxuto, sem iterator) que o TS pega globalmente no projeto.
  const entries: [string, string][] = [...(formData as any).entries()].map(([k, v]: [string, unknown]) => [k, String(v)]);
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ url, entries, descricao, status: 'pendente', erro: null, uid, criadoEm: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function normalizar(item: any): ItemFila {
  return {
    id: item.id,
    url: item.url,
    entries: item.entries,
    descricao: item.descricao ?? item.url,
    status: item.status ?? 'pendente',
    erro: item.erro ?? null,
    uid: item.uid ?? null,
    criadoEm: item.criadoEm
  };
}

export async function listarFila(): Promise<ItemFila[]> {
  const db = await abrirDb();
  const itens = await new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return itens.map(normalizar).sort((a, b) => a.criadoEm - b.criadoEm);
}

export async function obterItem(id: number): Promise<ItemFila | null> {
  const db = await abrirDb();
  const item = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return item ? normalizar(item) : null;
}

export async function removerDaFila(id: number): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// Marca um item como recusado pelo servidor — fica na fila (não perde o
// dado), pro publicador ver na tela de revisão e decidir.
export async function marcarErro(id: number, mensagem: string): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const atual = getReq.result;
      if (atual) store.put({ ...atual, status: 'erro', erro: mensagem });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// "Tentar de novo" na tela de revisão: volta pra pendente antes de
// reenviar, pra sumir o estado de erro mesmo se a nova tentativa também
// cair sem rede (não deve continuar mostrando o erro ANTIGO).
export async function marcarPendente(id: number): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const atual = getReq.result;
      if (atual) store.put({ ...atual, status: 'pendente', erro: null });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function contarFila(): Promise<number> {
  const db = await abrirDb();
  const n = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return n;
}
