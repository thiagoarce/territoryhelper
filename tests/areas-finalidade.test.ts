// Isolamento das duas malhas de área (pregação regular/rural x censo de
// idioma) no ponto onde ele é mais fácil de quebrar sem ninguém perceber:
// o filtro da consulta. Se um dia alguém tirar o `.eq('finalidade', ...)`,
// a tela territorial volta a baixar milhares de áreas de censo (7.124 em
// vez de 361 no piloto) e a oferecer aprovação de malha de idioma.
//
// O client Supabase aqui é um dublê que só REGISTRA os filtros aplicados —
// não há banco envolvido, e é exatamente isso que se quer testar.
import { listarQuadrasComGeo } from '$lib/queries';
import { assertEq, assertFalse, assertTrue, test } from './harness';

interface ChamadaTabela {
  tabela: string;
  filtros: Record<string, unknown>;
}

function clientFake() {
  const chamadas: ChamadaTabela[] = [];
  const from = (tabela: string) => {
    const chamada: ChamadaTabela = { tabela, filtros: {} };
    chamadas.push(chamada);
    const builder: any = {
      select: () => builder,
      order: () => builder,
      eq: (coluna: string, valor: unknown) => {
        chamada.filtros[coluna] = valor;
        return builder;
      },
      range: () => Promise.resolve({ data: [], error: null }),
      // territorios é aguardado direto (sem selectAll)
      then: (resolver: (r: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolver)
    };
    return builder;
  };
  return { chamadas, client: { from } as any };
}

function filtrosDe(chamadas: ChamadaTabela[], tabela: string) {
  return chamadas.find((c) => c.tabela === tabela)?.filtros;
}

test('quadras com geo: padrão é só pregação regular já aprovada', async () => {
  const { chamadas, client } = clientFake();
  await listarQuadrasComGeo(client);
  assertEq(filtrosDe(chamadas, 'quadras_geo'), {
    finalidade: 'regular-preaching',
    revisao_status: 'approved'
  });
});

test('editor territorial vê sugestões, mas nunca a malha de idioma', async () => {
  const { chamadas, client } = clientFake();
  await listarQuadrasComGeo(client, { incluirSugeridas: true });
  const filtros = filtrosDe(chamadas, 'quadras_geo')!;
  assertEq(filtros.finalidade, 'regular-preaching');
  assertFalse('revisao_status' in filtros, 'sugestões precisam aparecer na revisão');
});

test('módulo de censo carrega só a malha de idioma', async () => {
  const { chamadas, client } = clientFake();
  await listarQuadrasComGeo(client, {
    finalidade: 'language-census',
    incluirSugeridas: true,
    comContagens: false
  });
  assertEq(filtrosDe(chamadas, 'quadras_geo')!.finalidade, 'language-census');
  // Contagem de endereços vem do CNEFE, que não alimenta o censo de idioma.
  assertTrue(
    !chamadas.some((c) => c.tabela === 'quadras_contagens'),
    'censo não deve pedir contagem de endereços'
  );
});

test('fluxo operacional continua contando endereços por quadra', async () => {
  const { chamadas, client } = clientFake();
  await listarQuadrasComGeo(client);
  assertTrue(chamadas.some((c) => c.tabela === 'quadras_contagens'));
});
