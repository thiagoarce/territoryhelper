// W10: núcleo PURO (sem IndexedDB/fetch) da decisão de "o que fazer com
// cada item da fila, em que ordem, quando parar" — extraído de
// flushFila() (index.ts) só pra poder ser testado sem precisar simular
// IndexedDB (Node não tem; ver tests/README). `enviar` é injetado —
// index.ts passa a versão real (fetch), os testes passam um mock.
export type ResultadoItem = 'sucesso' | 'erro' | 'sem_rede';

export interface ResumoLote {
  sincronizados: number[];
  comErro: number[];
  /** id do item que fez o lote parar por falta de rede (null = terminou tudo) */
  parouEm: number | null;
}

// As actions são chamadas com URL RELATIVA ('?/marcarDesfecho') — que o
// fetch resolve contra a página ATUAL. Na hora de ENFILEIRAR isso precisa
// virar URL absoluta: o flush roda no root layout, possivelmente com o
// publicador já em OUTRA tela, e um '?/marcarDesfecho' relativo replayado
// da home postaria na action errada (endpoint inexistente → item vira
// "recusado" e o dado de campo se perde). Puro pra ser testável.
export function resolverUrlDaAcao(url: string, baseHref: string): string {
  return new URL(url, baseHref).href;
}

// Fila é POR USUÁRIO num aparelho compartilhado: item enfileirado por A
// não pode ser replayado com a sessão de B (a action gravaria B como
// autor do desfecho/conclusão). Item legado sem uid (fila anterior a esse
// fix) é tratado como do usuário atual — melhor arriscar autor errado uma
// única vez na migração do que descartar dado de campo.
export function pertenceAoUsuario(item: { uid?: string | null }, uidAtual: string | null): boolean {
  if (item.uid == null || item.uid === '') return true;
  return item.uid === uidAtual;
}

// Erro de SERVIDOR (item recusado) marca e segue pro próximo — não
// bloqueia os demais. Erro de REDE para o lote ali (sem sinal, não
// adianta insistir nos seguintes agora).
export async function processarLote<T extends { id: number }>(
  itens: T[],
  enviar: (item: T) => Promise<ResultadoItem>
): Promise<ResumoLote> {
  const sincronizados: number[] = [];
  const comErro: number[] = [];
  let parouEm: number | null = null;
  for (const item of itens) {
    const resultado = await enviar(item);
    if (resultado === 'sem_rede') {
      parouEm = item.id;
      break;
    }
    if (resultado === 'sucesso') sincronizados.push(item.id);
    else comErro.push(item.id);
  }
  return { sincronizados, comErro, parouEm };
}
