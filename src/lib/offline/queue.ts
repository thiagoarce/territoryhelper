// Fila de escrita offline — IndexedDB puro (sem lib), pra sobreviver a
// reload/fechar app enquanto sem sinal. Guarda o suficiente pra repetir o
// POST exato quando a conexão voltar: URL da action + entries do FormData.
const DB_NAME = 'territoryhelper-offline';
const STORE = 'fila_escrita';
const DB_VERSION = 1;

export interface ItemFila {
  id: number;
  url: string;
  entries: [string, string][];
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// FormData só serializa como string aqui — não cobre upload de arquivo
// (uso de campo, os fluxos offline são todos texto: ids, tipos, datas).
export async function enfileirar(url: string, formData: FormData): Promise<void> {
  const entries: [string, string][] = [...formData.entries()].map(([k, v]) => [k, String(v)]);
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ url, entries, criadoEm: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listarFila(): Promise<ItemFila[]> {
  const db = await abrirDb();
  const itens = await new Promise<ItemFila[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as ItemFila[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return itens.sort((a, b) => a.criadoEm - b.criadoEm);
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
