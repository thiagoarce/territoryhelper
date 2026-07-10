// W9: load UNIVERSAL no BROWSER (ssr=false) com cache offline — mesma
// receita W3/W4/W5/W8. Guard de aprovação (tp_aprovado) migrou do
// locals.profile pro profile do parent(); RLS continua sendo a fonte de
// verdade de posse dos dados (defesa em profundidade já cobre as actions).
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { selectAll } from '$lib/queries';
import { comCache } from '$lib/offline/cache-leitura';
import type { AgendamentoBase, ExcecaoBase } from '$lib/tp-agendamentos';
import { hojeIsoBrasil } from '$lib/utils/data';

export const ssr = false;

export interface TpPontoLite {
  id: number;
  nome: string;
  endereco: string | null;
}

export interface TpCarrinhoLite {
  id: number;
  nome: string;
  tipo_id: number;
  cor: string;
}

export interface TpPecaCatalogoLite {
  id: number;
  tipo_id: number;
  nome: string;
  categoria: 'fisica' | 'literatura';
  publicacao_id: number | null;
  ordem: number;
}

export interface TpRelatorioItemLinha {
  peca_id: number;
  estado: 'ok' | 'acabando' | 'zerado' | 'danificado';
  qtd_colocada: number | null;
  obs: string | null;
}

export interface TpRelatorioLinha {
  agendamento_id: number;
  data: string;
  publicador_id: string;
  notas: string | null;
  itens: TpRelatorioItemLinha[];
}

export interface CampanhaPublicacaoLite {
  publicacao_id: number;
  nome: string;
}

export interface TpParticipanteLinha {
  agendamento_id: number;
  data: string;
  publicador_id: string;
  status: 'designado' | 'aceito' | 'recusado';
}

export interface TpDisponibilidadeLinha {
  id: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

function mesAtual(): string {
  return hojeIsoBrasil().substring(0, 7); // 'YYYY-MM'
}

// Meses do ciclo do TP mensal: atual + 2 seguintes
function mesesAlvo(): string[] {
  const [y, m] = mesAtual().split('-').map(Number);
  return [0, 1, 2].map((off) => {
    const d = new Date(y, m - 1 + off, 1, 12);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

export function chaveTpCampo(userId: string): string {
  return `campo:tp:${userId}`;
}

export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');
  // U3: só admin ou publicador aprovado (profiles.tp_aprovado) vê o TP.
  if (profile.role !== 'admin' && !profile.tp_aprovado) {
    throw redirect(303, '/publicador');
  }

  const r = await comCache(chaveTpCampo(profile.id), () => carregarTpCampo(profile.id));
  return { ...r.valor, minhaId: profile.id, meuTpAprovado: profile.tp_aprovado ?? false, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

// Exportada pra ser reusada pelo prefetch da carteira (campo-fetchers.ts)
// — MESMA função, MESMA chave de cache, senão o prefetch não serve pra nada.
export async function carregarTpCampo(minhaId: string) {
  const supabase = supabaseBrowser();
  const escalaAte = new Date(Date.now() + 370 * 86400000).toISOString().slice(0, 10);
  const escalaDesde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const mes = mesAtual();

  const [
    tpAgendamentosRes, tpExcecoesRes, tpCarrinhosRes, tpPontosRes, tpParticipantesRes,
    tpPecasRes, campanhaAtivaRes, tpRelatoriosRes, nomesRes,
    prefRes, dispRes, mesesRes, dispMesRes, aprovadosRes
  ] = await Promise.all([
    supabase.from('tp_agendamentos').select('*').eq('ativo', true),
    supabase.from('tp_agendamento_excecoes').select('*'),
    supabase.from('tp_carrinhos').select('id, nome, tipo_id, cor'),
    supabase.from('tp_pontos').select('id, nome, endereco').eq('ativo', true),
    // Coluna `status` só existe depois da migration 058 — cai pra buscar
    // sem ela se ainda não tiver sido aplicada (mesma defesa do server antigo).
    selectAll<TpParticipanteLinha>(
      supabase.from('tp_agendamento_participantes').select('agendamento_id, data, publicador_id, status')
        .gte('data', escalaDesde).lte('data', escalaAte)
    ).catch(() =>
      selectAll<Omit<TpParticipanteLinha, 'status'>>(
        supabase.from('tp_agendamento_participantes').select('agendamento_id, data, publicador_id')
          .gte('data', escalaDesde).lte('data', escalaAte)
      ).then((linhas) => linhas.map((l) => ({ ...l, status: 'designado' as const })))
    ),
    supabase
      .from('tp_pecas_catalogo')
      .select('id, tipo_id, nome, categoria, publicacao_id, ordem')
      .eq('ativo', true)
      .order('tipo_id')
      .order('ordem'),
    supabase
      .from('campanhas')
      .select('publicacao_id, publicacoes(nome)')
      .eq('ativa', true)
      .not('publicacao_id', 'is', null)
      .maybeSingle(),
    supabase
      .from('tp_relatorios')
      .select('agendamento_id, data, publicador_id, notas, tp_relatorio_itens(peca_id, estado, qtd_colocada, obs)')
      .gte('data', escalaDesde).lte('data', escalaAte),
    supabase.from('profiles').select('id, nome'),
    supabase
      .from('tp_preferencias')
      .select('transporta_carrinho, notas')
      .eq('publicador_id', minhaId)
      .maybeSingle(),
    supabase
      .from('tp_disponibilidade')
      .select('id, dia_semana, hora_inicio, hora_fim')
      .eq('publicador_id', minhaId)
      .order('dia_semana')
      .order('hora_inicio'),
    supabase.from('tp_meses').select('mes, fase').in('mes', mesesAlvo()),
    supabase
      .from('tp_disponibilidade_mes')
      .select('id, mes, dia, hora_inicio, hora_fim')
      .eq('publicador_id', minhaId)
      .in('mes', mesesAlvo())
      .order('dia')
      .order('hora_inicio'),
    // T28: lista de convidáveis pra uma reserva — só aprovados pro TP.
    supabase.from('profiles').select('id, nome').eq('ativo', true).eq('tp_aprovado', true).order('nome')
  ]);

  // Queries cruas do supabase-js NÃO lançam em falha de rede (resolvem
  // {data:null, error}) — sem este guard, rede caindo com onLine ainda
  // true faria o load "resolver" com a agenda VAZIA e o comCache gravar
  // isso por cima do snapshot bom (regra do W5: fetcher tem que lançar).
  for (const r of [tpAgendamentosRes, tpExcecoesRes, tpCarrinhosRes, tpPontosRes, tpPecasRes, campanhaAtivaRes, tpRelatoriosRes, nomesRes, prefRes, dispRes, mesesRes, dispMesRes, aprovadosRes]) {
    if (r.error) throw r.error;
  }

  const tpAgendamentos = (tpAgendamentosRes.data ?? []) as AgendamentoBase[];
  const tpExcecoes = (tpExcecoesRes.data ?? []) as ExcecaoBase[];
  const tpCarrinhos: Record<number, TpCarrinhoLite> = {};
  for (const c of (tpCarrinhosRes.data ?? []) as any[]) tpCarrinhos[c.id] = { id: c.id, nome: c.nome, tipo_id: c.tipo_id, cor: c.cor };
  const tpPontos: Record<number, TpPontoLite> = {};
  for (const p of (tpPontosRes.data ?? []) as any[]) tpPontos[p.id] = { id: p.id, nome: p.nome, endereco: p.endereco };
  const tpParticipantes = (tpParticipantesRes ?? []) as TpParticipanteLinha[];
  const tpPecasCatalogo = (tpPecasRes.data ?? []) as TpPecaCatalogoLite[];
  const campanhaAtivaRow = campanhaAtivaRes.data as any;
  const campanhaPublicacao: CampanhaPublicacaoLite | null = campanhaAtivaRow
    ? { publicacao_id: campanhaAtivaRow.publicacao_id, nome: campanhaAtivaRow.publicacoes?.nome ?? '?' }
    : null;
  const tpRelatorios: TpRelatorioLinha[] = ((tpRelatoriosRes.data ?? []) as any[]).map((r) => ({
    agendamento_id: r.agendamento_id,
    data: r.data,
    publicador_id: r.publicador_id,
    notas: r.notas,
    itens: (r.tp_relatorio_itens ?? []) as TpRelatorioItemLinha[]
  }));
  const nomesPorId: Record<string, string> = {};
  for (const p of (nomesRes.data ?? []) as any[]) nomesPorId[p.id] = p.nome;

  return {
    tpAgendamentos, tpExcecoes, tpCarrinhos, tpPontos, tpParticipantes, nomesPorId,
    tpPecasCatalogo, campanhaPublicacao, tpRelatorios,
    tpPreferencias: prefRes.data ?? { transporta_carrinho: false, notas: null },
    tpDisponibilidade: (dispRes.data ?? []) as TpDisponibilidadeLinha[],
    mesAtual: mes,
    tpMeses: ((mesesRes.data ?? []) as { mes: string; fase: string }[]),
    mesesAlvo: mesesAlvo(),
    dispMes: ((dispMesRes.data ?? []) as { id: number; mes: string; dia: string; hora_inicio: string; hora_fim: string }[]),
    publicadoresAprovados: ((aprovadosRes.data ?? []) as { id: string; nome: string }[]).filter((p) => p.id !== minhaId)
  };
}
