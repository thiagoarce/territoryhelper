import type { PageServerLoad } from './$types';
import { rangeDoPeriodo, type Periodo } from '$lib/arranjos';
import { ocorrenciasAgendamentoEntre, agruparOcorrenciasPorData } from '$lib/tp-agendamentos';
import type { AgendamentoBase, ExcecaoBase } from '$lib/tp-agendamentos';

export interface TpCarrinhoCor {
  id: number;
  nome: string;
  cor: string;
}

const PERIODOS_VALIDOS: Periodo[] = ['semana', 'mes'];

export const load: PageServerLoad = async ({ locals, url }) => {
  const periodoParam = url.searchParams.get('periodo') as Periodo | null;
  const periodo: Periodo = periodoParam && PERIODOS_VALIDOS.includes(periodoParam) ? periodoParam : 'semana';
  const range = rangeDoPeriodo(periodo);

  const [carrinhosRes, pontosRes, agendamentosRes, excecoesRes] = await Promise.all([
    locals.supabase.from('tp_carrinhos').select('id, nome, cor').order('nome'),
    locals.supabase.from('tp_pontos_geo').select('id, nome').eq('ativo', true),
    locals.supabase.from('tp_agendamentos').select('*').eq('ativo', true),
    locals.supabase.from('tp_agendamento_excecoes').select('*')
  ]);

  const carrinhos = (carrinhosRes.data ?? []) as TpCarrinhoCor[];
  const corPorCarrinho: Record<number, TpCarrinhoCor> = {};
  for (const c of carrinhos) corPorCarrinho[c.id] = c;

  const pontos: Record<number, string> = {};
  for (const p of (pontosRes.data ?? []) as any[]) pontos[p.id] = p.nome;

  const agendamentos = (agendamentosRes.data ?? []) as AgendamentoBase[];
  const excecoes = (excecoesRes.data ?? []) as ExcecaoBase[];
  const ocorrencias = ocorrenciasAgendamentoEntre(agendamentos, excecoes, range.isoIni, range.isoFim);
  const ocPorData = agruparOcorrenciasPorData(ocorrencias);

  return { periodo, range, carrinhos, corPorCarrinho, pontos, ocPorData };
};
