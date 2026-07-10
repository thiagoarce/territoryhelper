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
