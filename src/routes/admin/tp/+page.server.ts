import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { rangeDoPeriodo, type Periodo } from '$lib/arranjos';
import { ocorrenciasAgendamentoEntre, ocorrenciaConflitante } from '$lib/tp-agendamentos';
import type { AgendamentoBase, ExcecaoBase, Recorrencia, OcorrenciaAgendamento } from '$lib/tp-agendamentos';
import { exigirAdmin, carregarAgendamentosEExcecoes, janelaChecagem } from './_shared';
import { criarNotificacao } from '$lib/server/push';

export interface TpCarrinhoLite {
  id: number;
  nome: string;
  cor: string;
  tipo_nome: string;
  status: 'disponivel' | 'manutencao' | 'aposentado';
}

export interface TpPontoLite {
  id: number;
  nome: string;
  endereco: string | null;
}

export interface TpParticipanteLinha {
  publicador_id: string;
  nome: string;
  origem: 'inscricao' | 'designacao';
}

export interface TpDisponibilidadeLinha {
  publicador_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

const RECORRENCIAS_VALIDAS: Recorrencia[] = ['nenhuma', 'diaria', 'semanal', 'quinzenal', 'mensal'];
const PERIODOS_VALIDOS: Periodo[] = ['semana', 'mes'];

export const load: PageServerLoad = async ({ locals, url }) => {
  const periodoParam = url.searchParams.get('periodo') as Periodo | null;
  const periodo: Periodo = periodoParam && PERIODOS_VALIDOS.includes(periodoParam) ? periodoParam : 'semana';
  const range = rangeDoPeriodo(periodo);

  const [carrinhosRes, tiposRes, pontosRes, agendamentosRes, excecoesRes, publicadoresRes, participantesRes, dispRes] =
    await Promise.all([
      locals.supabase.from('tp_carrinhos').select('id, nome, tipo_id, cor, status').order('nome'),
      locals.supabase.from('tp_carrinho_tipos').select('id, nome'),
      locals.supabase.from('tp_pontos_geo').select('id, nome, endereco').eq('ativo', true).order('nome'),
      locals.supabase.from('tp_agendamentos').select('*').eq('ativo', true),
      locals.supabase.from('tp_agendamento_excecoes').select('*'),
      locals.supabase.from('profiles').select('id, nome').eq('ativo', true).order('nome'),
      locals.supabase
        .from('tp_agendamento_participantes')
        .select('agendamento_id, data, publicador_id, origem')
        .gte('data', range.isoIni)
        .lte('data', range.isoFim),
      locals.supabase.from('tp_disponibilidade').select('publicador_id, dia_semana, hora_inicio, hora_fim')
    ]);

  const nomeTipoPorId: Record<number, string> = {};
  for (const t of (tiposRes.data ?? []) as any[]) nomeTipoPorId[t.id] = t.nome;

  const carrinhos: TpCarrinhoLite[] = ((carrinhosRes.data ?? []) as any[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    tipo_nome: nomeTipoPorId[c.tipo_id] ?? '?',
    status: c.status
  }));

  // Chips de carrinho agora são filtro multi-seleção (não single-select) —
  // sem o parâmetro na URL, todos aparecem sobrepostos na grade (cada um
  // com sua cor). `?carrinhos=` vazio é um estado válido (usuário
  // desmarcou tudo), por isso o default só entra quando o parâmetro nem
  // existe.
  const carrinhosParam = url.searchParams.get('carrinhos');
  const carrinhosSelecionados: number[] =
    carrinhosParam !== null
      ? carrinhosParam
          .split(',')
          .map(Number)
          .filter((id) => carrinhos.some((c) => c.id === id))
      : carrinhos.map((c) => c.id);

  const pontos: Record<number, TpPontoLite> = {};
  for (const p of (pontosRes.data ?? []) as any[]) pontos[p.id] = { id: p.id, nome: p.nome, endereco: p.endereco };

  const publicadores = (publicadoresRes.data ?? []) as { id: string; nome: string }[];
  const nomePorId: Record<string, string> = {};
  for (const p of publicadores) nomePorId[p.id] = p.nome;

  const agendamentos = (agendamentosRes.data ?? []) as AgendamentoBase[];
  const excecoes = (excecoesRes.data ?? []) as ExcecaoBase[];
  const todasOcorrencias = ocorrenciasAgendamentoEntre(agendamentos, excecoes, range.isoIni, range.isoFim);
  const ocorrencias: OcorrenciaAgendamento[] = todasOcorrencias.filter((o) =>
    carrinhosSelecionados.includes(o.carrinho_id)
  );

  const participantesPorOcorrencia: Record<string, TpParticipanteLinha[]> = {};
  for (const r of (participantesRes.data ?? []) as any[]) {
    const key = r.agendamento_id + '|' + r.data;
    (participantesPorOcorrencia[key] ||= []).push({
      publicador_id: r.publicador_id,
      nome: nomePorId[r.publicador_id] ?? '?',
      origem: r.origem
    });
  }

  const disponibilidade = (dispRes.data ?? []) as TpDisponibilidadeLinha[];

  // Agendamentos "base" (não expandidos) dos carrinhos selecionados — pra
  // popular o sheet de editar série (recorrência, data inicial, etc.).
  const agendamentosDoCarrinho = agendamentos.filter((a) => carrinhosSelecionados.includes(a.carrinho_id));

  return {
    periodo,
    range,
    carrinhos,
    carrinhosSelecionados,
    pontos,
    publicadores,
    ocorrencias,
    agendamentosDoCarrinho,
    participantesPorOcorrencia,
    disponibilidade,
    minhaId: locals.user!.id
  };
};

function validarCampos(fd: FormData) {
  const carrinhoId = Number(fd.get('carrinho_id') ?? 0);
  const pontoId = Number(fd.get('ponto_id') ?? 0) || null;
  const pontoAvulso = String(fd.get('ponto_avulso') ?? '').trim() || null;
  const horaInicio = String(fd.get('hora_inicio') ?? '').trim();
  const horaFim = String(fd.get('hora_fim') ?? '').trim();
  const notas = String(fd.get('notas') ?? '').trim() || null;
  return { carrinhoId, pontoId, pontoAvulso, horaInicio, horaFim, notas };
}

export const actions: Actions = {
  criarAgendamento: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const { carrinhoId, pontoId, pontoAvulso, horaInicio, horaFim, notas } = validarCampos(fd);
    const data = String(fd.get('data') ?? '').trim();
    const recorrencia = String(fd.get('recorrencia') ?? 'nenhuma').trim() as Recorrencia;
    const recorrenciaFim = String(fd.get('recorrencia_fim') ?? '').trim() || null;

    if (!carrinhoId) return fail(400, { erro: 'Equipamento obrigatório' });
    if (!pontoId && !pontoAvulso) return fail(400, { erro: 'Informe um ponto (fixo ou avulso)' });
    if (pontoId && pontoAvulso) return fail(400, { erro: 'Escolha ponto fixo OU avulso, não os dois' });
    if (!data || !horaInicio || !horaFim) return fail(400, { erro: 'Data e horário obrigatórios' });
    if (horaFim <= horaInicio) return fail(400, { erro: 'Hora de fim precisa ser depois da hora de início' });
    if (!RECORRENCIAS_VALIDAS.includes(recorrencia)) return fail(400, { erro: 'Recorrência inválida' });

    const { agendamentos, excecoes } = await carregarAgendamentosEExcecoes(locals.supabase);
    const candidato: AgendamentoBase = {
      id: -1, carrinho_id: carrinhoId, ponto_id: pontoId, ponto_avulso: pontoAvulso,
      data, hora_inicio: horaInicio, hora_fim: horaFim, recorrencia, recorrencia_fim: recorrenciaFim,
      ativo: true, notas
    };
    const janelaFim = janelaChecagem(recorrenciaFim);
    const minhasOcorrencias = ocorrenciasAgendamentoEntre([candidato], [], data, janelaFim);
    for (const oc of minhasOcorrencias) {
      const conflito = ocorrenciaConflitante(agendamentos, excecoes, carrinhoId, oc.data, oc.hora_inicio, oc.hora_fim);
      if (conflito) {
        return fail(409, {
          erro: `Esse equipamento já tem agendamento em ${oc.data} (${conflito.hora_inicio.substring(0, 5)}–${conflito.hora_fim.substring(0, 5)})`
        });
      }
    }

    const { error } = await locals.supabase.from('tp_agendamentos').insert({
      carrinho_id: carrinhoId, ponto_id: pontoId, ponto_avulso: pontoAvulso,
      data, hora_inicio: horaInicio, hora_fim: horaFim,
      recorrencia, recorrencia_fim: recorrenciaFim, notas, criado_por: locals.user!.id
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Agendamento criado' };
  },

  // aplicar_a='serie' muda o agendamento base inteiro; aplicar_a='ocorrencia'
  // grava uma exceção só pra essa data (o resto da série não muda).
  atualizarAgendamento: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const agendamentoId = Number(fd.get('agendamento_id') ?? 0);
    const ocorrenciaData = String(fd.get('ocorrencia_data') ?? '').trim();
    const aplicarA = String(fd.get('aplicar_a') ?? 'ocorrencia');
    const { carrinhoId, pontoId, pontoAvulso, horaInicio, horaFim, notas } = validarCampos(fd);

    if (!agendamentoId || !ocorrenciaData) return fail(400, { erro: 'Agendamento e data da ocorrência obrigatórios' });
    if (!carrinhoId) return fail(400, { erro: 'Equipamento obrigatório' });
    if (!pontoId && !pontoAvulso) return fail(400, { erro: 'Informe um ponto (fixo ou avulso)' });
    if (pontoId && pontoAvulso) return fail(400, { erro: 'Escolha ponto fixo OU avulso, não os dois' });
    if (!horaInicio || !horaFim) return fail(400, { erro: 'Horário obrigatório' });
    if (horaFim <= horaInicio) return fail(400, { erro: 'Hora de fim precisa ser depois da hora de início' });

    const { agendamentos, excecoes } = await carregarAgendamentosEExcecoes(locals.supabase);

    if (aplicarA === 'serie') {
      const recorrencia = String(fd.get('recorrencia') ?? '').trim() as Recorrencia;
      const recorrenciaFim = String(fd.get('recorrencia_fim') ?? '').trim() || null;
      const dataSerie = String(fd.get('data') ?? '').trim();
      if (!RECORRENCIAS_VALIDAS.includes(recorrencia)) return fail(400, { erro: 'Recorrência inválida' });
      if (!dataSerie) return fail(400, { erro: 'Data inicial da série obrigatória' });

      const outrosAgendamentos = agendamentos.filter((a) => a.id !== agendamentoId);
      const outrasExcecoes = excecoes.filter((e) => e.agendamento_id !== agendamentoId);
      const editado: AgendamentoBase = {
        id: agendamentoId, carrinho_id: carrinhoId, ponto_id: pontoId, ponto_avulso: pontoAvulso,
        data: dataSerie, hora_inicio: horaInicio, hora_fim: horaFim, recorrencia, recorrencia_fim: recorrenciaFim,
        ativo: true, notas
      };
      const janelaFim = janelaChecagem(recorrenciaFim);
      const minhasOcorrencias = ocorrenciasAgendamentoEntre([editado], [], dataSerie, janelaFim);
      for (const oc of minhasOcorrencias) {
        const conflito = ocorrenciaConflitante(outrosAgendamentos, outrasExcecoes, carrinhoId, oc.data, oc.hora_inicio, oc.hora_fim);
        if (conflito) {
          return fail(409, {
            erro: `Conflito de equipamento em ${oc.data} (${conflito.hora_inicio.substring(0, 5)}–${conflito.hora_fim.substring(0, 5)})`
          });
        }
      }

      const { error } = await locals.supabase.from('tp_agendamentos').update({
        carrinho_id: carrinhoId, ponto_id: pontoId, ponto_avulso: pontoAvulso,
        data: dataSerie, hora_inicio: horaInicio, hora_fim: horaFim,
        recorrencia, recorrencia_fim: recorrenciaFim, notas
      }).eq('id', agendamentoId);
      if (error) return fail(400, { erro: error.message });
      return { ok: true, msg: 'Série atualizada' };
    }

    // aplicar_a === 'ocorrencia'
    const conflito = ocorrenciaConflitante(agendamentos, excecoes, carrinhoId, ocorrenciaData, horaInicio, horaFim, agendamentoId);
    if (conflito) {
      return fail(409, {
        erro: `Conflito de equipamento em ${conflito.data} (${conflito.hora_inicio.substring(0, 5)}–${conflito.hora_fim.substring(0, 5)})`
      });
    }

    const { error } = await locals.supabase.from('tp_agendamento_excecoes').upsert(
      {
        agendamento_id: agendamentoId, data: ocorrenciaData, cancelada: false,
        carrinho_id: carrinhoId, ponto_id: pontoId, ponto_avulso: pontoAvulso,
        hora_inicio: horaInicio, hora_fim: horaFim, notas
      },
      { onConflict: 'agendamento_id,data' }
    );
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Ocorrência atualizada' };
  },

  cancelarOcorrencia: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const agendamentoId = Number(fd.get('agendamento_id') ?? 0);
    const data = String(fd.get('data') ?? '').trim();
    if (!agendamentoId || !data) return fail(400, { erro: 'agendamento_id e data obrigatórios' });
    const { error } = await locals.supabase
      .from('tp_agendamento_excecoes')
      .upsert({ agendamento_id: agendamentoId, data, cancelada: true }, { onConflict: 'agendamento_id,data' });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Ocorrência cancelada' };
  },

  arquivarAgendamento: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_agendamentos').update({ ativo: false }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Agendamento arquivado (some do planner, histórico fica)' };
  },

  apagarAgendamentoDefinitivo: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_agendamentos').delete().eq('id', id);
    if (error) return fail(400, { erro: 'Não deu pra excluir de vez (tem relatório vinculado) — arquive em vez disso.' });
    return { ok: true, msg: 'Agendamento excluído' };
  },

  designarParticipante: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const agendamentoId = Number(fd.get('agendamento_id') ?? 0);
    const data = String(fd.get('data') ?? '').trim();
    const publicadorId = String(fd.get('publicador_id') ?? '').trim();
    if (!agendamentoId || !data || !publicadorId) return fail(400, { erro: 'Campos obrigatórios' });
    const { error } = await locals.supabase.from('tp_agendamento_participantes').insert({
      agendamento_id: agendamentoId, data, publicador_id: publicadorId,
      origem: 'designacao', designado_por: locals.user!.id
    });
    if (error) return fail(400, { erro: error.message });
    await criarNotificacao([publicadorId], {
      titulo: 'Você foi escalado no testemunho público',
      corpo: new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }),
      url: '/publicador/arranjo'
    });
    return { ok: true, msg: 'Publicador designado' };
  },

  removerParticipante: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const agendamentoId = Number(fd.get('agendamento_id') ?? 0);
    const data = String(fd.get('data') ?? '').trim();
    const publicadorId = String(fd.get('publicador_id') ?? '').trim();
    if (!agendamentoId || !data || !publicadorId) return fail(400, { erro: 'Campos obrigatórios' });
    const { error } = await locals.supabase
      .from('tp_agendamento_participantes')
      .delete()
      .eq('agendamento_id', agendamentoId)
      .eq('data', data)
      .eq('publicador_id', publicadorId);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Removido do agendamento' };
  }
};
