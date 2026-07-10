// W10 (protocolo reforçado — mexe na fila de escrita offline, que
// protege dado de campo): cobre a regra central da fila 2.0 — um item
// recusado pelo SERVIDOR não bloqueia os seguintes; um item sem REDE
// para o lote ali (não teria como os seguintes darem certo).
import { test, assertEq, assertTrue, assertFalse } from './harness';
import { processarLote, resolverUrlDaAcao, pertenceAoUsuario, type ResultadoItem } from '$lib/offline/fila-logica';

interface ItemFake { id: number }

function mockEnviar(resultados: Record<number, ResultadoItem>) {
  const tentados: number[] = [];
  const enviar = async (item: ItemFake): Promise<ResultadoItem> => {
    tentados.push(item.id);
    return resultados[item.id];
  };
  return { enviar, tentados };
}

test('item com erro de servidor não bloqueia os seguintes', async () => {
  const itens: ItemFake[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const { enviar, tentados } = mockEnviar({ 1: 'sucesso', 2: 'erro', 3: 'sucesso' });
  const resumo = await processarLote(itens, enviar);
  assertEq(tentados, [1, 2, 3], 'todos os 3 itens devem ser tentados');
  assertEq(resumo.sincronizados, [1, 3]);
  assertEq(resumo.comErro, [2]);
  assertEq(resumo.parouEm, null);
});

test('erro de rede para o lote e não tenta os seguintes', async () => {
  const itens: ItemFake[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const { enviar, tentados } = mockEnviar({ 1: 'sucesso', 2: 'sem_rede', 3: 'sucesso' });
  const resumo = await processarLote(itens, enviar);
  assertEq(tentados, [1, 2], 'item 3 não deve nem ser tentado');
  assertEq(resumo.sincronizados, [1]);
  assertEq(resumo.comErro, []);
  assertEq(resumo.parouEm, 2);
});

test('múltiplos erros de servidor em sequência não interrompem o lote', async () => {
  const itens: ItemFake[] = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const { enviar, tentados } = mockEnviar({ 1: 'erro', 2: 'erro', 3: 'erro', 4: 'sucesso' });
  const resumo = await processarLote(itens, enviar);
  assertEq(tentados, [1, 2, 3, 4]);
  assertEq(resumo.sincronizados, [4]);
  assertEq(resumo.comErro, [1, 2, 3]);
  assertEq(resumo.parouEm, null);
});

test('lote vazio não tenta nada e não quebra', async () => {
  const { enviar, tentados } = mockEnviar({});
  const resumo = await processarLote([], enviar);
  assertEq(tentados, []);
  assertEq(resumo.sincronizados, []);
  assertEq(resumo.comErro, []);
  assertEq(resumo.parouEm, null);
});

// Regressão do bug de replay: URL relativa '?/acao' guardada crua na fila
// resolvia contra a tela onde o flush rodava (root layout), não contra a
// tela onde a ação foi feita — postava na action errada e perdia o dado.
test('resolverUrlDaAcao ancora ?/acao na página onde a ação foi feita', () => {
  assertEq(
    resolverUrlDaAcao('?/marcarDesfecho', 'https://app.exemplo/publicador/quadra/Q12'),
    'https://app.exemplo/publicador/quadra/Q12?/marcarDesfecho'
  );
});

test('resolverUrlDaAcao substitui query existente da página', () => {
  assertEq(
    resolverUrlDaAcao('?/toggle', 'https://app.exemplo/predio/45?aba=cartas'),
    'https://app.exemplo/predio/45?/toggle'
  );
});

test('resolverUrlDaAcao preserva URL já absoluta', () => {
  assertEq(
    resolverUrlDaAcao('https://app.exemplo/predio/45?/toggle', 'https://app.exemplo/publicador'),
    'https://app.exemplo/predio/45?/toggle'
  );
});

test('pertenceAoUsuario: item de outro uid não é do usuário atual', () => {
  assertFalse(pertenceAoUsuario({ uid: 'user-a' }, 'user-b'));
  assertTrue(pertenceAoUsuario({ uid: 'user-a' }, 'user-a'));
});

test('pertenceAoUsuario: item legado sem uid conta como do usuário atual', () => {
  assertTrue(pertenceAoUsuario({ uid: null }, 'user-b'));
  assertTrue(pertenceAoUsuario({}, 'user-b'));
  assertTrue(pertenceAoUsuario({ uid: '' }, 'user-b'));
});
