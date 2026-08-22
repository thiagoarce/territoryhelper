// Isolamento das duas malhas de área (pregação regular/rural x censo de
// idioma) no ponto onde ele é mais fácil de quebrar sem ninguém perceber:
// o filtro da consulta. Se um dia alguém tirar o `.eq('finalidade', ...)`,
// a tela territorial volta a baixar milhares de áreas de censo (7.124 em
// vez de 361 no piloto) e a oferecer aprovação de malha de idioma.
//
// O client Supabase aqui é um dublê que só REGISTRA os filtros aplicados —
// não há banco envolvido, e é exatamente isso que se quer testar.
import {
  listarAreasCensoViewport,
  listarQuadrasComGeo,
  resumoCensoIdioma
} from '$lib/queries';
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

test('censo por viewport envia limites, filtro e limite explícitos ao banco', async () => {
  let nome = '';
  let argumentos: Record<string, unknown> | undefined;
  const client = {
    rpc: async (funcao: string, args?: Record<string, unknown>) => {
      nome = funcao;
      argumentos = args;
      return {
        data: [{
          id: 'C-1', color: '#7c3aed', territorio_id: null, status: 'pendente',
          ativa: true, data_conclusao: null, notas: null, reservada_campanha_id: null,
          tipo_area: 'urban-block', finalidade: 'language-census',
          origem_geografica: 'osm-generated', revisao_status: 'suggested',
          confianca: 'medium', poly_geojson: { type: 'Polygon', coordinates: [] },
          total_viewport: 7
        }],
        error: null
      };
    }
  } as any;

  const resultado = await listarAreasCensoViewport(client, {
    west: -54.7, south: -20.6, east: -54.5, north: -20.3, zoom: 14
  }, 'manual', 500);

  assertEq(nome, 'areas_censo_viewport');
  assertEq(argumentos, {
    p_west: -54.7, p_south: -20.6, p_east: -54.5, p_north: -20.3,
    p_filtro: 'manual', p_limite: 500
  });
  assertEq(resultado.total, 7);
  assertEq(resultado.quadras.length, 1);
  assertEq(resultado.quadras[0].finalidade, 'language-census');
});

test('resumo do censo normaliza números e limites globais', async () => {
  const client = {
    rpc: async () => ({
      data: {
        total: '6763', aprovadas: 0, sugeridas: '6763', confiaveis: '6726', manual: 37,
        bounds: ['-54.8', '-20.7', '-54.4', '-20.2']
      },
      error: null
    })
  } as any;
  const resumo = await resumoCensoIdioma(client);
  assertEq(resumo, {
    total: 6763, aprovadas: 0, sugeridas: 6763, confiaveis: 6726, manual: 37,
    bounds: [-54.8, -20.7, -54.4, -20.2]
  });
});
