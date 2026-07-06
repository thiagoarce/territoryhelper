import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { selectAll } from '$lib/server/queries';
import type { AgendamentoBase, ExcecaoBase } from '$lib/tp-agendamentos';
import { criarNotificacao } from '$lib/server/push';

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

import { hojeIsoBrasil } from '$lib/utils/data';

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

// TP separado de Arranjo: arranjo é só pregação em grupo (criada em
// /admin/arranjos); testemunho público tem agenda própria aqui — mensal,
// por isso a disponibilidade fixa (tp_disponibilidade, cadastrada uma vez)
// precisa ser CONFIRMADA a cada mês novo (migration 054) antes do admin
// montar o Planner daquele mês.
export const load: PageServerLoad = async ({ locals }) => {
  const escalaAte = new Date(Date.now() + 370 * 86400000).toISOString().slice(0, 10);
  const escalaDesde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const mes = mesAtual();

  const [
    tpAgendamentosRes, tpExcecoesRes, tpCarrinhosRes, tpPontosRes, tpParticipantesRes,
    tpPecasRes, campanhaAtivaRes, tpRelatoriosRes, nomesRes,
    prefRes, dispRes, mesesRes, dispMesRes
  ] = await Promise.all([
    locals.supabase.from('tp_agendamentos').select('*').eq('ativo', true),
    locals.supabase.from('tp_agendamento_excecoes').select('*'),
    locals.supabase.from('tp_carrinhos').select('id, nome, tipo_id, cor'),
    locals.supabase.from('tp_pontos').select('id, nome, endereco').eq('ativo', true),
    selectAll<TpParticipanteLinha>(
      locals.supabase.from('tp_agendamento_participantes').select('agendamento_id, data, publicador_id, status')
        .gte('data', escalaDesde).lte('data', escalaAte)
    ),
    locals.supabase
      .from('tp_pecas_catalogo')
      .select('id, tipo_id, nome, categoria, publicacao_id, ordem')
      .eq('ativo', true)
      .order('tipo_id')
      .order('ordem'),
    locals.supabase
      .from('campanhas')
      .select('publicacao_id, publicacoes(nome)')
      .eq('ativa', true)
      .not('publicacao_id', 'is', null)
      .maybeSingle(),
    locals.supabase
      .from('tp_relatorios')
      .select('agendamento_id, data, publicador_id, notas, tp_relatorio_itens(peca_id, estado, qtd_colocada, obs)')
      .gte('data', escalaDesde).lte('data', escalaAte),
    locals.supabase.from('profiles').select('id, nome'),
    locals.supabase
      .from('tp_preferencias')
      .select('transporta_carrinho, notas')
      .eq('publicador_id', locals.user!.id)
      .maybeSingle(),
    locals.supabase
      .from('tp_disponibilidade')
      .select('id, dia_semana, hora_inicio, hora_fim')
      .eq('publicador_id', locals.user!.id)
      .order('dia_semana')
      .order('hora_inicio'),
    locals.supabase.from('tp_meses').select('mes, fase').in('mes', mesesAlvo()),
    locals.supabase
      .from('tp_disponibilidade_mes')
      .select('id, mes, dia, hora_inicio, hora_fim')
      .eq('publicador_id', locals.user!.id)
      .in('mes', mesesAlvo())
      .order('dia')
      .order('hora_inicio')
  ]);

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
    minhaId: locals.user!.id,
    tpAgendamentos, tpExcecoes, tpCarrinhos, tpPontos, tpParticipantes, nomesPorId,
    tpPecasCatalogo, campanhaPublicacao, tpRelatorios,
    tpPreferencias: prefRes.data ?? { transporta_carrinho: false, notas: null },
    tpDisponibilidade: (dispRes.data ?? []) as TpDisponibilidadeLinha[],
    mesAtual: mes,
    tpMeses: ((mesesRes.data ?? []) as { mes: string; fase: string }[]),
    mesesAlvo: mesesAlvo(),
    dispMes: ((dispMesRes.data ?? []) as { id: number; mes: string; dia: string; hora_inicio: string; hora_fim: string }[])
  };
};

export const actions: Actions = {
  inscreverAgendamento: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const agendamentoId = Number(fd.get('agendamento_id') ?? 0);
    const dataOc = String(fd.get('data') ?? '').trim();
    if (!agendamentoId || !dataOc) return fail(400, { erro: 'agendamento_id e data obrigatórios' });

    const { data: agendamento, error: errA } = await locals.supabase
      .from('tp_agendamentos').select('ativo').eq('id', agendamentoId).single();
    if (errA || !agendamento) return fail(404, { erro: 'Agendamento não encontrado' });
    if (!agendamento.ativo) return fail(400, { erro: 'Esse agendamento não está mais ativo' });

    const { error } = await locals.supabase
      .from('tp_agendamento_participantes')
      .insert({ agendamento_id: agendamentoId, data: dataOc, publicador_id: locals.user.id, origem: 'inscricao' });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Inscrito' };
  },

  sairAgendamento: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const agendamentoId = Number(fd.get('agendamento_id') ?? 0);
    const dataOc = String(fd.get('data') ?? '').trim();
    if (!agendamentoId || !dataOc) return fail(400, { erro: 'agendamento_id e data obrigatórios' });
    const { error } = await locals.supabase
      .from('tp_agendamento_participantes').delete()
      .eq('agendamento_id', agendamentoId).eq('data', dataOc).eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });

    const horasAte = (new Date(dataOc + 'T12:00:00').getTime() - Date.now()) / 3600000;
    if (horasAte >= 0 && horasAte <= 48) {
      const { data: admins } = await locals.supabase.from('profiles').select('id').eq('role', 'admin');
      const adminIds = (admins ?? []).map((a: any) => a.id as string);
      if (adminIds.length > 0) {
        await criarNotificacao(adminIds, {
          titulo: `${locals.profile?.nome ?? 'Um publicador'} saiu de um turno de TP em <48h`,
          corpo: new Date(dataOc + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }),
          url: '/admin/tp'
        });
      }
    }
    return { ok: true, msg: 'Saiu do agendamento' };
  },

  // TP-D: relatório de fim de agendamento. 1 por ocorrência (unique
  // agendamento_id+data) — quem manda primeiro "é dono" (RLS só deixa o
  // criador ou admin editar depois).
  salvarRelatorio: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const agendamentoId = Number(fd.get('agendamento_id') ?? 0);
    const dataOc = String(fd.get('data') ?? '').trim();
    const notas = String(fd.get('notas') ?? '').trim() || null;
    let itensBrutos: any[];
    try {
      itensBrutos = JSON.parse(String(fd.get('itens_json') ?? '[]'));
    } catch {
      return fail(400, { erro: 'Checklist inválido' });
    }
    if (!agendamentoId || !dataOc) return fail(400, { erro: 'agendamento_id e data obrigatórios' });
    if (!Array.isArray(itensBrutos) || itensBrutos.length === 0) return fail(400, { erro: 'Marque ao menos um item do checklist' });

    const { data: souParticipante } = await locals.supabase
      .from('tp_agendamento_participantes')
      .select('publicador_id')
      .eq('agendamento_id', agendamentoId)
      .eq('data', dataOc)
      .eq('publicador_id', locals.user.id)
      .maybeSingle();
    if (!souParticipante && locals.profile?.role !== 'admin') {
      return fail(403, { erro: 'Você não estava nessa saída' });
    }

    const itens: { peca_id: number; estado: string; qtd_colocada: number | null; obs: string | null }[] = [];
    for (const bruto of itensBrutos) {
      let pecaId = Number(bruto.peca_id) || null;
      if (!pecaId && bruto.publicacao_virtual_id && bruto.tipo_id) {
        const { data: existente } = await locals.supabase
          .from('tp_pecas_catalogo')
          .select('id')
          .eq('tipo_id', Number(bruto.tipo_id))
          .eq('publicacao_id', Number(bruto.publicacao_virtual_id))
          .maybeSingle();
        if (existente) {
          pecaId = existente.id;
        } else {
          const { data: criada, error: errCriar } = await locals.supabase
            .from('tp_pecas_catalogo')
            .insert({
              tipo_id: Number(bruto.tipo_id),
              nome: String(bruto.nome_virtual ?? 'Publicação da campanha'),
              categoria: 'literatura',
              publicacao_id: Number(bruto.publicacao_virtual_id)
            })
            .select('id')
            .single();
          if (errCriar) return fail(400, { erro: errCriar.message });
          pecaId = criada.id;
        }
      }
      if (!pecaId) continue;
      const estado = String(bruto.estado ?? '');
      if (!['ok', 'acabando', 'zerado', 'danificado'].includes(estado)) continue;
      itens.push({
        peca_id: pecaId,
        estado,
        qtd_colocada: bruto.qtd_colocada != null && bruto.qtd_colocada !== '' ? Number(bruto.qtd_colocada) : null,
        obs: String(bruto.obs ?? '').trim() || null
      });
    }
    if (itens.length === 0) return fail(400, { erro: 'Nenhum item válido no checklist' });

    const { data: relatorio, error: errRel } = await locals.supabase
      .from('tp_relatorios')
      .upsert(
        { agendamento_id: agendamentoId, data: dataOc, publicador_id: locals.user.id, notas },
        { onConflict: 'agendamento_id,data' }
      )
      .select('id')
      .single();
    if (errRel) {
      return fail(409, { erro: 'Já existe relatório desse turno enviado por outro participante' });
    }

    await locals.supabase.from('tp_relatorio_itens').delete().eq('relatorio_id', relatorio.id);
    const { error: errItens } = await locals.supabase
      .from('tp_relatorio_itens')
      .insert(itens.map((it) => ({ relatorio_id: relatorio.id, ...it })));
    if (errItens) return fail(400, { erro: errItens.message });

    return { ok: true, msg: 'Relatório enviado' };
  },

  // TP-E: publicador sugere um ponto de TP na área dele — entra pendente
  // pro admin validar.
  sugerirPonto: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const endereco = String(fd.get('endereco') ?? '').trim() || null;
    const lat = parseFloat(String(fd.get('lat') ?? ''));
    const lng = parseFloat(String(fd.get('lng') ?? ''));
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!isFinite(lat) || !isFinite(lng)) return fail(400, { erro: 'Marque a localização (GPS)' });
    const { error } = await locals.supabase.from('tp_pontos').insert({
      nome, endereco,
      geo: { type: 'Point', coordinates: [lng, lat] },
      pendente: true, ativo: false, criado_por: locals.user.id
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Sugestão enviada — aguarde o admin aprovar' };
  },

  // TP-B: transporte do equipamento — upsert (1 linha por publicador). Movido de /perfil.
  salvarPreferenciasTp: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const transportaCarrinho = fd.get('transporta_carrinho') === 'on';
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const { error } = await locals.supabase
      .from('tp_preferencias')
      .upsert(
        { publicador_id: locals.user.id, transporta_carrinho: transportaCarrinho, notas, atualizado_em: new Date().toISOString() },
        { onConflict: 'publicador_id' }
      );
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Preferências salvas' };
  },

  adicionarDisponibilidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const diaSemana = Number(fd.get('dia_semana') ?? -1);
    const horaInicio = String(fd.get('hora_inicio') ?? '').trim();
    const horaFim = String(fd.get('hora_fim') ?? '').trim();
    if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) return fail(400, { erro: 'Dia da semana inválido' });
    if (!horaInicio || !horaFim) return fail(400, { erro: 'Horário obrigatório' });
    if (horaFim <= horaInicio) return fail(400, { erro: 'Hora de fim precisa ser depois da hora de início' });
    const { error } = await locals.supabase.from('tp_disponibilidade').insert({
      publicador_id: locals.user.id,
      dia_semana: diaSemana,
      hora_inicio: horaInicio,
      hora_fim: horaFim
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Janela adicionada' };
  },

  removerDisponibilidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_disponibilidade').delete().eq('id', id).eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Janela removida' };
  },

  // T26: salva as janelas de UM DIA do mês (substitui as existentes do
  // dia). janelas_json = [{inicio:'HH:MM', fim:'HH:MM'}] — vazio limpa o dia.
  salvarDisponibilidadeDia: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const mes = String(fd.get('mes') ?? '').trim();
    const dia = String(fd.get('dia') ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(mes) || !dia.startsWith(mes)) return fail(400, { erro: 'Dia/mês inválido' });
    let janelas: { inicio: string; fim: string }[] = [];
    try {
      janelas = JSON.parse(String(fd.get('janelas_json') ?? '[]'));
    } catch {
      return fail(400, { erro: 'janelas_json inválido' });
    }
    for (const j of janelas) {
      if (!/^\d{2}:\d{2}$/.test(j.inicio) || !/^\d{2}:\d{2}$/.test(j.fim) || j.fim <= j.inicio) {
        return fail(400, { erro: `Janela inválida: ${j.inicio}–${j.fim}` });
      }
    }
    const del = await locals.supabase
      .from('tp_disponibilidade_mes')
      .delete()
      .eq('publicador_id', locals.user.id)
      .eq('dia', dia);
    if (del.error) return fail(400, { erro: del.error.message });
    if (janelas.length > 0) {
      const { error } = await locals.supabase.from('tp_disponibilidade_mes').insert(
        janelas.map((j) => ({
          publicador_id: locals.user!.id, mes, dia,
          hora_inicio: j.inicio, hora_fim: j.fim
        }))
      );
      if (error) return fail(400, { erro: error.message });
    }
    return { ok: true, msg: 'Dia salvo' };
  },

  // T26: pré-preenche o mês inteiro a partir do padrão semanal
  // (tp_disponibilidade). Só quando o mês ainda está vazio — não
  // sobrescreve ajustes manuais.
  preencherMesDoPadrao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const mes = String(fd.get('mes') ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(mes)) return fail(400, { erro: 'Mês inválido' });
    const { count } = await locals.supabase
      .from('tp_disponibilidade_mes')
      .select('id', { count: 'exact', head: true })
      .eq('publicador_id', locals.user.id)
      .eq('mes', mes);
    if ((count ?? 0) > 0) return fail(400, { erro: 'O mês já tem dias marcados — ajuste dia a dia' });
    const { data: padrao } = await locals.supabase
      .from('tp_disponibilidade')
      .select('dia_semana, hora_inicio, hora_fim')
      .eq('publicador_id', locals.user.id);
    if (!padrao || padrao.length === 0) return fail(400, { erro: 'Sem padrão semanal cadastrado' });
    const [y, m] = mes.split('-').map(Number);
    const ultimoDia = new Date(y, m, 0, 12).getDate();
    const linhas: any[] = [];
    for (let d = 1; d <= ultimoDia; d++) {
      const data = new Date(y, m - 1, d, 12);
      for (const p of padrao as any[]) {
        if (p.dia_semana === data.getDay()) {
          linhas.push({
            publicador_id: locals.user.id, mes,
            dia: `${mes}-${String(d).padStart(2, '0')}`,
            hora_inicio: p.hora_inicio, hora_fim: p.hora_fim
          });
        }
      }
    }
    if (linhas.length === 0) return fail(400, { erro: 'Padrão semanal não gera nenhum dia nesse mês' });
    const { error } = await locals.supabase.from('tp_disponibilidade_mes').insert(linhas);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${linhas.length} janela(s) criadas do padrão` };
  },

  // T27: aceitar/recusar a designação de um turno (só o próprio registro)
  responderDesignacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const agendamentoId = Number(fd.get('agendamento_id') ?? 0);
    const dataOc = String(fd.get('data') ?? '').trim();
    const resposta = String(fd.get('resposta') ?? '').trim();
    if (!agendamentoId || !dataOc) return fail(400, { erro: 'Parâmetros obrigatórios' });
    if (!['aceito', 'recusado'].includes(resposta)) return fail(400, { erro: 'Resposta inválida' });
    const { error, count } = await locals.supabase
      .from('tp_agendamento_participantes')
      .update({ status: resposta }, { count: 'exact' })
      .eq('agendamento_id', agendamentoId)
      .eq('data', dataOc)
      .eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    if (!count) return fail(404, { erro: 'Você não está designado nesse turno' });
    return { ok: true, msg: resposta === 'aceito' ? 'Designação aceita' : 'Designação recusada' };
  }
};
