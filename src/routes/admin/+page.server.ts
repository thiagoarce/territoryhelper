// W3: o LOAD desta rota mora em +page.ts (universal, roda no BROWSER
// com ssr=false) — leituras vão direto browser→Supabase via RLS, sem
// custo de CPU no Worker. Este arquivo fica só com as ACTIONS (que
// continuam server-side de propósito: guards, travas de conflito e
// notificação são defesa em profundidade).
import type { Actions } from './$types';
import { hojeIsoBrasil, horaBrasilParaIso } from '$lib/utils/data';
import { exigirAdminAction } from '$lib/server/guards';
import { fail } from '@sveltejs/kit';
import {
  quadrasEmArranjoFuturo,
  msgConflitoArranjo,
  quadrasReservadasBloqueando,
  msgConflitoReserva
} from '$lib/server/queries';
import { criarNotificacao } from '$lib/server/push';
import { registrarConclusaoLado, desfazerConclusaoLado } from '$lib/server/conclusao';
import { ladosDaQuadra } from '$lib/lados';

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
    const tcesIds = fd.getAll('tces_ids').map((v) => String(v)).filter(Boolean);
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (quadrasIds.length === 0 && tcesIds.length === 0) return fail(400, { erro: 'quadras ou TCEs obrigatórios' });
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

    if (quadrasIds.length > 0) {
      const linhas = quadrasIds.map((qid) => ({ designacao_id: des.id, quadra_id: qid }));
      const { error: errJ } = await locals.supabase.from('designacao_quadras').insert(linhas);
      if (errJ) return fail(400, { erro: 'Designação criada mas falhou ao vincular quadras: ' + errJ.message });
    }
    if (tcesIds.length > 0) {
      const linhasTce = tcesIds.map((tid) => ({ designacao_id: des.id, tce_id: tid }));
      const { error: errT } = await locals.supabase.from('designacao_tces').insert(linhasTce);
      if (errT) return fail(400, { erro: 'Designação criada mas falhou ao vincular TCE(s): ' + errT.message });
    }

    const part = publicadorIds.map((pid, i) => ({
      designacao_id: des.id,
      publicador_id: pid,
      papel: i === 0 ? 'lider' : 'participante'
    }));
    await locals.supabase.from('designacao_publicadores').insert(part);
    const partes = [
      quadrasIds.length > 0 ? `${quadrasIds.length} quadra(s)` : null,
      tcesIds.length > 0 ? `${tcesIds.length} TCE(s)` : null
    ].filter(Boolean);
    await criarNotificacao(publicadorIds, {
      titulo: 'Nova designação de território',
      corpo: partes.join(' + '),
      url: '/publicador'
    });
    return { ok: true, msg: `Designada a ${publicadorIds.length} publicador(es) com ${partes.join(' + ')}` };
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

  // Anexa TCEs selecionados a um arranjo (mesma trava de conflito que
  // adicionarQuadrasAoArranjo: bloqueia se o TCE já tiver designação
  // pessoal aberta ou já estiver em OUTRO arranjo ativo).
  adicionarTcesAoArranjo: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    const tcesIds = fd.getAll('tces_ids').map((v) => String(v)).filter(Boolean);
    const substituir = fd.get('substituir') === 'on' || fd.get('substituir') === 'true';
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });
    if (tcesIds.length === 0) return fail(400, { erro: 'Sem TCEs selecionados' });

    const { data: arr, error: errR } = await locals.supabase
      .from('arranjos').select('tces_ids').eq('id', arranjoId).single();
    if (errR || !arr) return fail(400, { erro: 'Arranjo não encontrado' });

    const { data: desigTceAbertas } = await locals.supabase
      .from('designacao_tces')
      .select('tce_id, designacoes!inner(status)')
      .eq('designacoes.status', 'aberta')
      .in('tce_id', tcesIds);
    const ocupPorDesig = [...new Set((desigTceAbertas ?? []).map((r: any) => r.tce_id as string))];
    if (ocupPorDesig.length > 0) {
      return fail(409, { erro: `TCE(s) ${ocupPorDesig.join(', ')} já tem designação aberta. Encerre antes.` });
    }

    const { data: outrosArranjos } = await locals.supabase
      .from('arranjos')
      .select('id, tces_ids')
      .eq('ativo', true)
      .neq('id', arranjoId)
      .overlaps('tces_ids', tcesIds);
    const conflitantes = [...new Set(
      (outrosArranjos ?? []).flatMap((a: any) => ((a.tces_ids ?? []) as string[]).filter((t) => tcesIds.includes(t)))
    )];
    if (conflitantes.length > 0) {
      return fail(409, { erro: `TCE(s) ${conflitantes.join(', ')} já está(ão) em outro arranjo ativo.` });
    }

    const atuais = (arr.tces_ids ?? []) as string[];
    const novas = substituir ? tcesIds : Array.from(new Set([...atuais, ...tcesIds]));
    const { error } = await locals.supabase
      .from('arranjos').update({ tces_ids: novas }).eq('id', arranjoId);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${tcesIds.length} TCE(s) anexado(s) ao arranjo` };
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
    const hora = String(fd.get('hora') ?? '').trim();
    const marcadoEm = hora ? horaBrasilParaIso(data, hora) : null;
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
      marcado_por: locals.user!.id,
      ...(marcadoEm ? { marcado_em: marcadoEm, hora_informada: true } : {})
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

    // Território designado a arranjo com quadras SOBRANDO (não concluídas
    // ainda): não libera sozinho — só avisa a UI, que pergunta ao admin se
    // quer liberar (reusa a action liberarQuadrasDeArranjos já existente).
    // Cenário real: sobra 1-2 quadras teimosas e o admin já dá o
    // território como pronto — igual à margem de tolerância do S-13.
    const { data: arranjosTocados } = await locals.supabase
      .from('arranjos')
      .select('id, quadras_ids')
      .eq('ativo', true)
      .overlaps('quadras_ids', ids);
    let quadrasRestantesEmArranjo: string[] = [];
    if (arranjosTocados && arranjosTocados.length > 0) {
      const todasQuadrasDosArranjos = [...new Set(arranjosTocados.flatMap((a) => (a.quadras_ids ?? []) as string[]))];
      const outrasQuadras = todasQuadrasDosArranjos.filter((qid) => !ids.includes(qid));
      if (outrasQuadras.length > 0) {
        const { data: statusOutras } = await locals.supabase
          .from('quadras')
          .select('id, data_conclusao')
          .in('id', outrasQuadras);
        quadrasRestantesEmArranjo = (statusOutras ?? [])
          .filter((q) => q.data_conclusao == null)
          .map((q) => q.id);
      }
    }

    return {
      ok: true,
      msg: `${ids.length} quadra(s) marcada(s) como concluída(s)`,
      quadrasRestantesEmArranjo
    };
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
  // Lados da quadra (migration 092) pro admin: "as pessoas informam e
  // ele tem que botar no sistema". Devolve os lados derivados dos
  // endereços + o que já foi marcado no ciclo atual.
  ladosDaQuadra: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const [locaisRes, ladosRes, quadraRes] = await Promise.all([
      locals.supabase.from('locais').select('id, logradouro, marcado_nao_existe').eq('quadra_id', id),
      locals.supabase
        .from('quadra_lados_conclusoes')
        .select('lado_chave, data_conclusao, marcado_em')
        .eq('quadra_id', id),
      locals.supabase.from('quadras').select('data_conclusao').eq('id', id).maybeSingle()
    ]);
    if (locaisRes.error) return fail(400, { erro: locaisRes.error.message });
    if (ladosRes.error) return fail(400, { erro: ladosRes.error.message });
    return {
      ok: true,
      lados: ladosDaQuadra(
        locaisRes.data ?? [],
        ladosRes.data ?? [],
        quadraRes.data?.data_conclusao ?? null
      )
    };
  },

  concluirLadoAdmin: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const quadraId = String(fd.get('quadra_id') ?? '');
    const chave = String(fd.get('lado_chave') ?? '');
    const rotulo = String(fd.get('lado_rotulo') ?? '');
    if (!quadraId || !chave || !rotulo) return fail(400, { erro: 'quadra e lado obrigatórios' });
    const data = String(fd.get('data') ?? '').trim() || hojeIsoBrasil();
    const hora = String(fd.get('hora') ?? '').trim();
    const marcadoEm = hora ? horaBrasilParaIso(data, hora) : null;
    const r = await registrarConclusaoLado(
      locals.supabase,
      quadraId,
      { chave, rotulo },
      data,
      locals.user.id,
      marcadoEm
    );
    if (r.error) return fail(400, { erro: r.error });
    return {
      ok: true,
      quadraConcluida: r.quadraConcluida,
      msg: r.quadraConcluida ? 'Último lado — quadra concluída' : `Lado "${rotulo}" marcado`
    };
  },

  desfazerLadoAdmin: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const quadraId = String(fd.get('quadra_id') ?? '');
    const chave = String(fd.get('lado_chave') ?? '');
    if (!quadraId || !chave) return fail(400, { erro: 'quadra e lado obrigatórios' });
    const { error: err } = await desfazerConclusaoLado(locals.supabase, quadraId, chave);
    if (err) return fail(400, { erro: err });
    return { ok: true, msg: 'Marca do lado removida' };
  },

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
