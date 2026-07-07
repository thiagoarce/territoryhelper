import type { Actions, PageServerLoad } from './$types';
import { hojeIsoBrasil } from '$lib/utils/data';
import { exigirAdminAction } from '$lib/server/guards';
import { fail } from '@sveltejs/kit';
import {
  listarQuadrasComGeo,
  listarDesignacoes,
  listarPublicadores,
  quadrasEmArranjoFuturo,
  msgConflitoArranjo,
  quadrasReservadasBloqueando,
  msgConflitoReserva
} from '$lib/server/queries';
import { statusCampanha } from '$lib/campanhas';
import { criarNotificacao } from '$lib/server/push';

export const load: PageServerLoad = async ({ locals }) => {
  const [quadras, designacoes, publicadores, campanhaRes, curadoriaPendenteRes] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase),
    listarPublicadores(locals.supabase),
    locals.supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, ativa')
      .eq('ativa', true)
      .maybeSingle(),
    // A24: "Feedback do campo" — resumo da fila de curadoria (T12 constrói a
    // tela de revisão; aqui é só o contador + link).
    locals.supabase.from('curadoria_edicoes').select('tipo').eq('status', 'pendente')
  ]);
  const curadoriaPendente = {
    total: curadoriaPendenteRes.data?.length ?? 0,
    edicao: (curadoriaPendenteRes.data ?? []).filter((c) => c.tipo === 'edicao').length,
    criacao: (curadoriaPendenteRes.data ?? []).filter((c) => c.tipo === 'criacao').length,
    nao_existe: (curadoriaPendenteRes.data ?? []).filter((c) => c.tipo === 'nao_existe').length
  };
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  const quadrasAlocadas = new Set<string>();
  for (const d of abertas) for (const q of d.quadras_ids) quadrasAlocadas.add(q);
  // Quadras em arranjos ativos também contam como alocadas (trava).
  // O arranjo É o trava — não precisa criar designacao paralela.
  // alocacaoArranjoPorQuadra: pra UI mostrar "está em arranjo X em DD/MM"

  const campanhaAtiva = campanhaRes.data ?? null;
  const campanhaPlanejada = campanhaAtiva && statusCampanha(campanhaAtiva) === 'planejada' ? campanhaAtiva : null;
  // Quadras reservadas pra ELA (visual + trava). Enquanto a campanha não
  // começa, reserva também conta como alocada (não pode ir pra outro lugar).
  const reservadasIds = campanhaAtiva
    ? quadras.filter((q) => q.reservada_campanha_id === campanhaAtiva.id).map((q) => q.id)
    : [];
  if (campanhaPlanejada) for (const q of reservadasIds) quadrasAlocadas.add(q);

  // Arranjos do tipo 'quadras' (pra anexar quadras selecionadas via Visão Geral)
  const { data: modsQ } = await locals.supabase
    .from('arranjo_modalidades').select('id, nome, tipo_territorio, cor');
  const modsQuadrasIds = new Set((modsQ ?? []).filter((m: any) => m.tipo_territorio === 'quadras').map((m: any) => m.id));
  const { data: arranjosRaw } = await locals.supabase
    .from('arranjos')
    .select('id, nome, modalidade_id, data, dia_semana, recorrente, quadras_ids, hora_inicio, ativo')
    .eq('ativo', true)
    .order('data', { nullsFirst: false })
    .order('hora_inicio', { nullsFirst: false });
  const modById = new Map((modsQ ?? []).map((m: any) => [m.id, m]));
  const arranjosQuadras = (arranjosRaw ?? [])
    .filter((a: any) => modsQuadrasIds.has(a.modalidade_id))
    .map((a: any) => ({
      ...a,
      modalidade_nome: modById.get(a.modalidade_id)?.nome ?? '?',
      modalidade_cor: modById.get(a.modalidade_id)?.cor ?? '#3b82f6'
    }));

  // Trava de arranjos: cada quadra em arranjo ativo é "alocada" (sem precisar
  // criar designação paralela — o próprio arranjo é a trava).
  const arranjoPorQuadra: Record<string, { id: number; nome: string; modalidade_nome: string; modalidade_cor: string; data: string | null }> = {};
  for (const a of arranjosQuadras) {
    for (const q of (a.quadras_ids ?? []) as string[]) {
      quadrasAlocadas.add(q);
      if (!arranjoPorQuadra[q]) {
        arranjoPorQuadra[q] = {
          id: a.id,
          nome: a.nome || a.modalidade_nome,
          modalidade_nome: a.modalidade_nome,
          modalidade_cor: a.modalidade_cor,
          data: a.data
        };
      }
    }
  }

  return {
    quadras,
    designacoesAbertas: abertas,
    publicadores,
    quadrasAlocadas: [...quadrasAlocadas],
    arranjosQuadras,
    arranjoPorQuadra,
    campanhaAtiva,
    campanhaPlanejada,
    reservadasIds,
    curadoriaPendente
  };
};

export const actions: Actions = {
  // Admin designa TERRITÓRIO PESSOAL direto da Geral (sempre pessoal —
  // saída em grupo é arranjo, gerido em /admin/arranjos com dirigente).
  criarDesignacao: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const publicadorIds = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (quadrasIds.length === 0) return fail(400, { erro: 'quadras obrigatórias' });
    if (publicadorIds.length === 0) return fail(400, { erro: 'pelo menos 1 publicador obrigatório' });

    // Bloqueia quadras já em arranjo futuro (defesa server-side; UI também avisa)
    const conflitos = await quadrasEmArranjoFuturo(locals.supabase, quadrasIds);
    if (conflitos.size > 0) return fail(409, { erro: msgConflitoArranjo(conflitos) });

    const reservas = await quadrasReservadasBloqueando(locals.supabase, quadrasIds);
    if (reservas.size > 0) return fail(409, { erro: msgConflitoReserva(reservas) });

    const { data: des, error: errD } = await locals.supabase
      .from('designacoes')
      .insert({
        tipo: 'pessoal',
        publicador_id: publicadorIds[0],
        prazo,
        notas,
        status: 'aberta',
        criado_por: locals.user.id
      })
      .select('id')
      .single();
    if (errD) return fail(400, { erro: errD.message });

    const linhas = quadrasIds.map((qid) => ({ designacao_id: des.id, quadra_id: qid }));
    const { error: errJ } = await locals.supabase.from('designacao_quadras').insert(linhas);
    if (errJ) return fail(400, { erro: 'Designação criada mas falhou ao vincular: ' + errJ.message });

    const part = publicadorIds.map((pid, i) => ({
      designacao_id: des.id,
      publicador_id: pid,
      papel: i === 0 ? 'lider' : 'participante'
    }));
    await locals.supabase.from('designacao_publicadores').insert(part);
    await criarNotificacao(publicadorIds, {
      titulo: 'Nova designação de território',
      corpo: `${quadrasIds.length} quadra(s)`,
      url: '/publicador'
    });
    return { ok: true, msg: `Designada a ${publicadorIds.length} publicador(es) com ${quadrasIds.length} quadra(s)` };
  },

  // Anexa quadras selecionadas a um arranjo (tipo 'quadras'). Admin → arranjo
  // direto, sem precisar de dirigente. Junta com as quadras_ids existentes.
  adicionarQuadrasAoArranjo: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const substituir = fd.get('substituir') === 'on' || fd.get('substituir') === 'true';
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });
    if (quadrasIds.length === 0) return fail(400, { erro: 'Sem quadras selecionadas' });

    const { data: arr, error: errR } = await locals.supabase
      .from('arranjos').select('quadras_ids').eq('id', arranjoId).single();
    if (errR || !arr) return fail(400, { erro: 'Arranjo não encontrado' });

    // Bloqueia se quadras tiverem designação pessoal aberta ou estiverem em
    // OUTRO arranjo ativo (uma quadra em dois lugares quebraria a trava)
    const { data: desigAbertas } = await locals.supabase
      .from('designacoes').select('id, designacao_quadras(quadra_id)')
      .eq('status', 'aberta');
    const ocupPorDesig: string[] = [];
    for (const d of (desigAbertas ?? []) as any[]) {
      for (const dq of d.designacao_quadras ?? []) {
        if (quadrasIds.includes(dq.quadra_id)) ocupPorDesig.push(dq.quadra_id);
      }
    }
    if (ocupPorDesig.length > 0) {
      return fail(409, { erro: `Quadra(s) ${Array.from(new Set(ocupPorDesig)).join(', ')} já tem designação aberta. Encerre antes.` });
    }
    const conflitosArr = await quadrasEmArranjoFuturo(locals.supabase, quadrasIds, [arranjoId]);
    if (conflitosArr.size > 0) return fail(409, { erro: msgConflitoArranjo(conflitosArr) });

    const reservasArr = await quadrasReservadasBloqueando(locals.supabase, quadrasIds);
    if (reservasArr.size > 0) return fail(409, { erro: msgConflitoReserva(reservasArr) });

    const atuais = (arr.quadras_ids ?? []) as string[];
    const novas = substituir ? quadrasIds : Array.from(new Set([...atuais, ...quadrasIds]));
    const { error } = await locals.supabase
      .from('arranjos').update({ quadras_ids: novas }).eq('id', arranjoId);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${quadrasIds.length} quadra(s) anexada(s) ao arranjo` };
  },

  // Remove quadras de QUALQUER arranjo onde estão (libera a trava).
  // Útil pra desfazer engano ou liberar quadra concluída.
  liberarQuadrasDeArranjos: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    if (quadrasIds.length === 0) return fail(400, { erro: 'Sem quadras' });

    const { data: arranjos } = await locals.supabase
      .from('arranjos').select('id, quadras_ids').eq('ativo', true)
      .overlaps('quadras_ids', quadrasIds);
    if (!arranjos || arranjos.length === 0) return { ok: true, msg: 'Nada a fazer (não estavam em arranjo)' };

    let removidasTotal = 0;
    for (const a of arranjos) {
      const atuais = (a.quadras_ids ?? []) as string[];
      const novas = atuais.filter((q) => !quadrasIds.includes(q));
      if (novas.length === atuais.length) continue;
      removidasTotal += atuais.length - novas.length;
      const { error } = await locals.supabase
        .from('arranjos').update({ quadras_ids: novas }).eq('id', a.id);
      if (error) return fail(400, { erro: `Falhou ao atualizar arranjo ${a.id}: ${error.message}` });
    }
    return { ok: true, msg: `${removidasTotal} quadra(s) liberada(s) de ${arranjos.length} arranjo(s)` };
  },

  // Reserva quadras selecionadas pra uma campanha planejada ("quarentena")
  // — descansa o território até o início. Admin só (defesa em profundidade).
  reservarQuadras: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (locals.profile?.role !== 'admin') return fail(403, { erro: 'Só admin' });
    const fd = await request.formData();
    const campanhaId = Number(fd.get('campanha_id') ?? 0);
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    if (!campanhaId) return fail(400, { erro: 'campanha_id obrigatório' });
    if (quadrasIds.length === 0) return fail(400, { erro: 'Sem quadras selecionadas' });
    const { error } = await locals.supabase
      .from('quadras').update({ reservada_campanha_id: campanhaId }).in('id', quadrasIds);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${quadrasIds.length} quadra(s) reservada(s) pra campanha` };
  },

  // Libera a reserva das quadras selecionadas (não precisa ser da mesma campanha).
  liberarReservaQuadras: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (locals.profile?.role !== 'admin') return fail(403, { erro: 'Só admin' });
    const fd = await request.formData();
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    if (quadrasIds.length === 0) return fail(400, { erro: 'Sem quadras selecionadas' });
    const { error } = await locals.supabase
      .from('quadras').update({ reservada_campanha_id: null }).in('id', quadrasIds);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `Reserva liberada de ${quadrasIds.length} quadra(s)` };
  },

  // ============================================================
  // Concluir quadra — fundido de /admin/registro (rota removida).
  // ============================================================
  marcarConcluidas: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    const data = String(fd.get('data') ?? '').trim() || hojeIsoBrasil();
    // modo: 'normal' (detecta conflito) | 'substituir' (troca a mais recente) | 'historico' (só adiciona)
    const modo = String(fd.get('modo') ?? 'normal');
    if (ids.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });

    // Em modo 'normal' — detecta se a data sendo marcada é ANTERIOR à mais recente
    // no histórico de alguma das quadras selecionadas. Se sim, devolve conflito
    // pra UI pedir confirmação (erro / substituir / só histórico).
    if (modo === 'normal') {
      const { data: hist } = await locals.supabase
        .from('quadras_conclusoes')
        .select('quadra_id, data_conclusao')
        .in('quadra_id', ids)
        .order('data_conclusao', { ascending: false });
      const ultimaPorQuadra = new Map<string, string>();
      for (const h of hist ?? []) {
        if (!ultimaPorQuadra.has(h.quadra_id)) ultimaPorQuadra.set(h.quadra_id, h.data_conclusao);
      }
      const conflitos = ids.filter((qid) => {
        const ult = ultimaPorQuadra.get(qid);
        return ult && ult > data;
      });
      if (conflitos.length > 0) {
        return {
          ok: false,
          conflito: true,
          ids: conflitos,
          data,
          ultimas: conflitos.map((qid) => ({ id: qid, ultima: ultimaPorQuadra.get(qid)! }))
        };
      }
    }

    // 0. SELF-HEAL: pra cada quadra com data_conclusao atual mas SEM histórico,
    //    cria entrada de backfill primeiro. Cobre dados vindos do CSV onde a
    //    user não rodou o insert manual de quadras_conclusoes.
    const { data: estado } = await locals.supabase
      .from('quadras')
      .select('id, data_conclusao')
      .in('id', ids)
      .not('data_conclusao', 'is', null);
    if (estado && estado.length > 0) {
      const { data: jaTemHist } = await locals.supabase
        .from('quadras_conclusoes')
        .select('quadra_id')
        .in('quadra_id', estado.map((q) => q.id));
      const idsComHist = new Set((jaTemHist ?? []).map((h) => h.quadra_id));
      const backfill = estado
        .filter((q) => !idsComHist.has(q.id))
        .map((q) => ({ quadra_id: q.id, data_conclusao: q.data_conclusao }));
      if (backfill.length > 0) {
        await locals.supabase.from('quadras_conclusoes').insert(backfill);
      }
    }

    // Modo 'substituir' — remove a entrada mais recente do histórico de cada quadra
    if (modo === 'substituir') {
      for (const qid of ids) {
        const { data: ult } = await locals.supabase
          .from('quadras_conclusoes')
          .select('id')
          .eq('quadra_id', qid)
          .order('data_conclusao', { ascending: false })
          .order('id', { ascending: false })
          .limit(1);
        if (ult && ult[0]) {
          await locals.supabase.from('quadras_conclusoes').delete().eq('id', ult[0].id);
        }
      }
    }

    // 1. Loga no histórico (uma linha por quadra)
    const linhas = ids.map((qid) => ({
      quadra_id: qid,
      data_conclusao: data,
      marcado_por: locals.user!.id
    }));
    await locals.supabase.from('quadras_conclusoes').insert(linhas);

    // 2. Atualiza quadras — quadra.data_conclusao recebe a MAIOR data do histórico
    //    (em modo 'historico' isso garante que adicionar uma data antiga não derruba a atual)
    for (const qid of ids) {
      const { data: max } = await locals.supabase
        .from('quadras_conclusoes')
        .select('data_conclusao')
        .eq('quadra_id', qid)
        .order('data_conclusao', { ascending: false })
        .limit(1);
      const maiorData = max?.[0]?.data_conclusao ?? data;
      await locals.supabase
        .from('quadras')
        .update({ data_conclusao: maiorData })
        .eq('id', qid);
    }

    // Fechar designações cujas quadras estão TODAS concluídas
    const { data: dqLinhas } = await locals.supabase
      .from('designacao_quadras')
      .select('designacao_id, quadra_id')
      .in('quadra_id', ids);
    const designacoesIds = [...new Set((dqLinhas ?? []).map((l) => l.designacao_id))];
    for (const dId of designacoesIds) {
      const { data: todasLinhas } = await locals.supabase
        .from('designacao_quadras')
        .select('quadra_id, quadras(data_conclusao)')
        .eq('designacao_id', dId);
      const todasConcluidas = (todasLinhas ?? []).every((l: any) => l.quadras?.data_conclusao != null);
      if (todasConcluidas && (todasLinhas?.length ?? 0) > 0) {
        await locals.supabase.from('designacoes').update({ status: 'concluida' }).eq('id', dId);
      }
    }

    return { ok: true, msg: `${ids.length} quadra(s) marcada(s) como concluída(s)` };
  },

  // Reverter restaura a PENÚLTIMA conclusão. Se não houver penúltima
  // (só 1 ou 0 entradas no histórico), NÃO apaga — só avisa.
  // Nunca destrói dado sem ter alternativa pra mostrar.
  reverter: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    if (ids.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });

    let revertidas = 0;
    let semHistorico = 0;
    for (const qid of ids) {
      const { data: hist } = await locals.supabase
        .from('quadras_conclusoes')
        .select('id, data_conclusao')
        .eq('quadra_id', qid)
        .order('data_conclusao', { ascending: false })
        .order('id', { ascending: false })
        .limit(2);

      // Só reverte se houver penúltima — caso contrário deixa como está
      if (!hist || hist.length < 2) {
        semHistorico++;
        continue;
      }

      // Remove a última (atual) e restaura a penúltima
      await locals.supabase.from('quadras_conclusoes').delete().eq('id', hist[0].id);
      await locals.supabase
        .from('quadras')
        .update({ data_conclusao: hist[1].data_conclusao })
        .eq('id', qid);
      revertidas++;
    }

    let msg = '';
    if (revertidas > 0) msg += `${revertidas} revertida(s)`;
    if (semHistorico > 0) {
      if (msg) msg += '. ';
      msg += `${semHistorico} sem conclusão anterior (não revertida — long-press pra ver histórico)`;
    }
    return { ok: true, msg };
  },

  // Limpar conclusão (botão explícito, destrutivo) — apaga TODO o histórico e data
  limparConclusao: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    if (ids.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });
    await locals.supabase.from('quadras_conclusoes').delete().in('quadra_id', ids);
    const { error } = await locals.supabase
      .from('quadras')
      .update({ data_conclusao: null })
      .in('id', ids);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${ids.length} limpa(s) (histórico apagado)` };
  },

  // Histórico de conclusões de uma quadra (pro long-press / detalhe)
  historico: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { data, error } = await locals.supabase
      .from('quadras_conclusoes')
      .select('id, data_conclusao, marcado_em, marcado_por, profiles(nome)')
      .eq('quadra_id', id)
      .order('data_conclusao', { ascending: false })
      .order('id', { ascending: false })
      .limit(20);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, historico: data };
  }
};
