// Escrita resiliente a sinal ruim: tenta o POST normal; se a rede falhar
// de verdade (fetch rejeita — TypeError, não um 4xx/5xx do servidor),
// enfileira em IndexedDB e devolve `offline: true` em vez de derrubar a
// UI com "Falhou". `flushFila` reenvia tudo na ordem quando a conexão volta.
import { deserialize } from '$app/forms';
import { enfileirar, listarFila, removerDaFila, contarFila, type ItemFila } from './queue';

export type ResultadoEscrita =
  | { ok: true; offline: false; data: any }
  | { ok: false; offline: true }
  | { ok: false; offline: false; erro: string };

function formDataDeEntries(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

export async function postComFila(url: string, formData: FormData): Promise<ResultadoEscrita> {
  try {
    const res = await fetch(url, { method: 'POST', body: formData });
    const parsed = deserialize(await res.text()) as any;
    if (parsed.type === 'success') return { ok: true, offline: false, data: parsed.data };
    return { ok: false, offline: false, erro: String(parsed.data?.erro || 'Falhou') };
  } catch {
    // fetch rejeitou = sem rede de verdade (não é erro do servidor, que
    // chegaria como response válida acima). Enfileira pra reenviar depois.
    await enfileirar(url, formData);
    return { ok: false, offline: true };
  }
}

export interface ResultadoFlush {
  sincronizadas: number;
  restantes: number;
}

// Reenvia a fila em ordem. Para no primeiro erro de rede (ainda offline) —
// não pula itens, pra não sincronizar fora de ordem.
export async function flushFila(): Promise<ResultadoFlush> {
  const itens = await listarFila();
  let sincronizadas = 0;
  for (const item of itens) {
    const ok = await tentarReenviar(item);
    if (!ok) break;
    sincronizadas++;
  }
  const restantes = await contarFila();
  return { sincronizadas, restantes };
}

async function tentarReenviar(item: ItemFila): Promise<boolean> {
  try {
    const res = await fetch(item.url, { method: 'POST', body: formDataDeEntries(item.entries) });
    // Mesmo que o servidor recuse (ex: conflito, validação), a REQUISIÇÃO
    // chegou — não é mais um problema de rede. Remove da fila de qualquer
    // forma (reenviar um erro de validação pra sempre não ajuda ninguém).
    void res;
    await removerDaFila(item.id);
    return true;
  } catch {
    return false; // ainda sem rede — para o flush, tenta de novo depois
  }
}

export { contarFila };
