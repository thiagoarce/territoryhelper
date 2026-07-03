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
  /** chegou ao servidor mas ele recusou (RLS/validação) — removida da fila
   *  mesmo assim (reenviar um erro de permissão pra sempre não ajuda),
   *  mas SEM contar como sucesso — antes qualquer resposta HTTP (mesmo
   *  403/400) era tratada como "sincronizado", escondendo perda de dado. */
  falhas: number;
  restantes: number;
}

// Reenvia a fila em ordem. Para no primeiro erro de REDE (ainda offline) —
// não pula itens, pra não sincronizar fora de ordem. Erro do SERVIDOR não
// para o flush (não é mais um problema de conectividade).
export async function flushFila(): Promise<ResultadoFlush> {
  const itens = await listarFila();
  let sincronizadas = 0;
  let falhas = 0;
  for (const item of itens) {
    const resultado = await tentarReenviar(item);
    if (resultado === 'sem_rede') break;
    if (resultado === 'sucesso') sincronizadas++;
    else falhas++;
  }
  const restantes = await contarFila();
  return { sincronizadas, falhas, restantes };
}

async function tentarReenviar(item: ItemFila): Promise<'sucesso' | 'erro' | 'sem_rede'> {
  try {
    const res = await fetch(item.url, { method: 'POST', body: formDataDeEntries(item.entries) });
    const parsed = deserialize(await res.text()) as any;
    // A requisição chegou ao servidor — não é mais problema de rede, então
    // sai da fila de qualquer forma (sucesso ou recusa definitiva).
    await removerDaFila(item.id);
    return parsed.type === 'success' ? 'sucesso' : 'erro';
  } catch {
    return 'sem_rede'; // fetch rejeitou de verdade — tenta de novo depois
  }
}

export { contarFila };
