// Escrita resiliente a sinal ruim: tenta o POST normal; se a rede falhar
// de verdade (fetch rejeita — TypeError, não um 4xx/5xx do servidor),
// enfileira em IndexedDB e devolve `offline: true` em vez de derrubar a
// UI com "Falhou". `flushFila` reenvia os PENDENTES na ordem quando a
// conexão volta.
//
// W10 ("fila 2.0"): um item recusado pelo SERVIDOR (RLS/validação) não
// some mais da fila — fica com status='erro' pro publicador revisar
// (`FilaOfflineSheet.svelte`) e escolher tentar de novo ou descartar.
// Isso também significa que um item com erro NÃO bloqueia os itens
// seguintes: flushFila marca o erro e segue pro próximo, só um erro de
// REDE genuíno (`sem_rede`) para o lote (não adianta tentar os outros
// se não tem sinal nenhum).
import { deserialize } from '$app/forms';
import {
  enfileirar, listarFila, removerDaFila, marcarErro, marcarPendente, obterItem, contarFila,
  type ItemFila
} from './queue';
import { processarLote, resolverUrlDaAcao, pertenceAoUsuario } from './fila-logica';
import { lerUidAtual } from './status';

export type ResultadoEscrita =
  | { ok: true; offline: false; data: any }
  | { ok: false; offline: true }
  | { ok: false; offline: false; erro: string };

function formDataDeEntries(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

export async function postComFila(url: string, formData: FormData, descricao: string): Promise<ResultadoEscrita> {
  try {
    const res = await fetch(url, { method: 'POST', body: formData });
    const parsed = deserialize(await res.text()) as any;
    if (parsed.type === 'success') return { ok: true, offline: false, data: parsed.data };
    return { ok: false, offline: false, erro: String(parsed.data?.erro || 'Falhou') };
  } catch {
    // fetch rejeitou = sem rede de verdade (não é erro do servidor, que
    // chegaria como response válida acima). Enfileira pra reenviar depois.
    // A URL vai ABSOLUTIZADA (o replay acontece de qualquer tela) e
    // etiquetada com o uid atual (aparelho compartilhado).
    await enfileirar(resolverUrlDaAcao(url, location.href), formData, descricao, lerUidAtual());
    return { ok: false, offline: true };
  }
}

export interface ResultadoFlush {
  sincronizadas: number;
  /** chegou ao servidor mas ele recusou (RLS/validação) — fica na fila
   *  com status='erro' pro publicador revisar, NÃO conta como perdido. */
  falhas: number;
  restantes: number;
}

// Reenvia os PENDENTES em ordem (lógica de continuar/parar em
// processarLote — testada em tests/fila-logica.test.ts). Só itens do
// USUÁRIO ATUAL: item de A esperando na fila não pode subir com a
// sessão de B (aparelho compartilhado) — fica guardado até A voltar.
export async function flushFila(): Promise<ResultadoFlush> {
  const uid = lerUidAtual();
  const itens = (await listarFila()).filter(
    (i) => i.status === 'pendente' && pertenceAoUsuario(i, uid)
  );
  const resumo = await processarLote(itens, tentarReenviar);
  const restantes = (await filaDoUsuarioAtual()).length;
  return { sincronizadas: resumo.sincronizados.length, falhas: resumo.comErro.length, restantes };
}

// Fila visível/contável = só a do usuário logado (a de outros usuários
// do aparelho continua no IndexedDB, invisível, esperando o dono).
export async function filaDoUsuarioAtual(): Promise<ItemFila[]> {
  const uid = lerUidAtual();
  return (await listarFila()).filter((i) => pertenceAoUsuario(i, uid));
}

export async function contarFilaDoUsuario(): Promise<number> {
  return (await filaDoUsuarioAtual()).length;
}

async function tentarReenviar(item: ItemFila): Promise<'sucesso' | 'erro' | 'sem_rede'> {
  try {
    const res = await fetch(item.url, { method: 'POST', body: formDataDeEntries(item.entries) });
    const parsed = deserialize(await res.text()) as any;
    if (parsed.type === 'success') {
      await removerDaFila(item.id);
      return 'sucesso';
    }
    await marcarErro(item.id, String(parsed.data?.erro || 'Recusado pelo servidor'));
    return 'erro';
  } catch {
    return 'sem_rede'; // fetch rejeitou de verdade — tenta de novo depois
  }
}

// Tela de revisão: tenta reenviar UM item específico (erro ou pendente
// travado), fora do lote automático.
export async function reenviarItem(id: number): Promise<'sucesso' | 'erro' | 'sem_rede' | 'nao_encontrado'> {
  const item = await obterItem(id);
  if (!item) return 'nao_encontrado';
  await marcarPendente(id);
  return tentarReenviar(item);
}

export async function descartarItem(id: number): Promise<void> {
  await removerDaFila(id);
}

export { contarFila, listarFila, type ItemFila };
