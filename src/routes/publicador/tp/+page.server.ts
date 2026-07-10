// W9: load foi pro +page.ts (universal, browser). Aqui só ficam as
// actions — mutações continuam no Worker por defesa em profundidade.
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import type { AgendamentoBase, ExcecaoBase } from '$lib/tp-agendamentos';
import { ocorrenciaConflitante } from '$lib/tp-agendamentos';
import { criarNotificacao } from '$lib/server/push';

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
  },

  // T28: reserva de sobra — publicador aprovado cria um turno pontual
  // próprio numa célula vazia da grade, convidando outros aprovados.
  criarReserva: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!locals.profile?.tp_aprovado) return fail(403, { erro: 'Você ainda não foi aprovado pro testemunho público — fale com o admin' });
    const fd = await request.formData();
    const dataOc = String(fd.get('data') ?? '').trim();
    const horaInicio = String(fd.get('hora_inicio') ?? '').trim();
    const horaFim = String(fd.get('hora_fim') ?? '').trim();
    const carrinhoId = Number(fd.get('carrinho_id') ?? 0);
    const pontoId = Number(fd.get('ponto_id') ?? 0) || null;
    const pontoAvulso = String(fd.get('ponto_avulso') ?? '').trim() || null;
    const convidadoIds = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);
    if (!dataOc || !horaInicio || !horaFim || !carrinhoId) return fail(400, { erro: 'Campos obrigatórios' });
    if (!pontoId && !pontoAvulso) return fail(400, { erro: 'Escolha um ponto' });
    if (horaFim <= horaInicio) return fail(400, { erro: 'Hora de fim precisa ser depois da de início' });

    if (convidadoIds.length > 0) {
      const { data: convidadosRows } = await locals.supabase.from('profiles').select('id, tp_aprovado').in('id', convidadoIds);
      const naoAprovados = ((convidadosRows ?? []) as any[]).filter((p) => !p.tp_aprovado);
      if (naoAprovados.length > 0) return fail(400, { erro: 'Algum convidado ainda não foi aprovado pro TP' });
    }

    // Equipamento livre nesse horário — mesma checagem usada no admin/tp.
    const [{ data: agRows }, { data: excRows }] = await Promise.all([
      locals.supabase.from('tp_agendamentos').select('*').eq('ativo', true),
      locals.supabase.from('tp_agendamento_excecoes').select('*')
    ]);
    const conflito = ocorrenciaConflitante((agRows ?? []) as AgendamentoBase[], (excRows ?? []) as ExcecaoBase[], carrinhoId, dataOc, horaInicio, horaFim);
    if (conflito) return fail(409, { erro: 'Esse equipamento já está reservado nesse horário' });

    const { data: novo, error } = await locals.supabase
      .from('tp_agendamentos')
      .insert({
        carrinho_id: carrinhoId, ponto_id: pontoId, ponto_avulso: pontoAvulso,
        data: dataOc, hora_inicio: horaInicio, hora_fim: horaFim,
        recorrencia: 'nenhuma', ativo: true, origem: 'reserva', criado_por: locals.user.id
      })
      .select('id')
      .single();
    if (error) return fail(400, { erro: error.message });

    const participantes = [
      { agendamento_id: novo.id, data: dataOc, publicador_id: locals.user.id, origem: 'inscricao', status: 'designado' },
      ...convidadoIds.map((pid) => ({ agendamento_id: novo.id, data: dataOc, publicador_id: pid, origem: 'designacao', status: 'designado' }))
    ];
    const { error: errP } = await locals.supabase.from('tp_agendamento_participantes').insert(participantes);
    if (errP) return fail(400, { erro: 'Reserva criada mas falhou ao convidar: ' + errP.message });

    if (convidadoIds.length > 0) {
      await criarNotificacao(convidadoIds, {
        titulo: 'Você foi convidado pra um turno de testemunho público',
        corpo: new Date(dataOc + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }),
        url: '/publicador/tp'
      });
    }

    // Admin também é avisado — reserva de sobra é uma designação criada
    // fora do fluxo normal (montagem/manual), vale ele saber que aconteceu.
    const { data: admins } = await locals.supabase.from('profiles').select('id').eq('role', 'admin');
    const adminIds = (admins ?? []).map((a: any) => a.id as string);
    if (adminIds.length > 0) {
      await criarNotificacao(adminIds, {
        titulo: `${locals.profile?.nome ?? 'Um publicador'} criou uma reserva de TP`,
        corpo: new Date(dataOc + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }) + ` · ${horaInicio}–${horaFim}`,
        url: '/admin/tp'
      });
    }

    return { ok: true, msg: 'Reserva criada' };
  },

  cancelarReserva: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const agendamentoId = Number(fd.get('agendamento_id') ?? 0);
    if (!agendamentoId) return fail(400, { erro: 'agendamento_id obrigatório' });
    const { data: ag } = await locals.supabase.from('tp_agendamentos').select('criado_por, origem').eq('id', agendamentoId).maybeSingle();
    if (!ag || ag.origem !== 'reserva') return fail(400, { erro: 'Não é uma reserva' });
    if (ag.criado_por !== locals.user.id && locals.profile?.role !== 'admin') {
      return fail(403, { erro: 'Só quem criou a reserva pode cancelar' });
    }
    const { error } = await locals.supabase.from('tp_agendamentos').update({ ativo: false }).eq('id', agendamentoId);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Reserva cancelada' };
  }
};
