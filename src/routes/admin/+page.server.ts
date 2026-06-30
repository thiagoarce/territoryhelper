import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarQuadrasComGeo, listarDesignacoes, listarPublicadores } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [quadras, designacoes, publicadores] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase),
    listarPublicadores(locals.supabase)
  ]);
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  const quadrasAlocadas = new Set<string>();
  for (const d of abertas) for (const q of d.quadras_ids) quadrasAlocadas.add(q);

  // Participantes por designação (multi-publicador)
  const participantesPorDesignacao: Record<number, string[]> = {};
  if (abertas.length > 0) {
    const { data: parts } = await locals.supabase
      .from('designacao_publicadores')
      .select('designacao_id, publicador_id, papel')
      .in('designacao_id', abertas.map((d) => d.id));
    for (const p of parts ?? []) {
      const arr = participantesPorDesignacao[p.designacao_id] ?? [];
      // Líder primeiro
      if (p.papel === 'lider') arr.unshift(p.publicador_id);
      else arr.push(p.publicador_id);
      participantesPorDesignacao[p.designacao_id] = arr;
    }
  }

  // TCEs (criados em Polígonos; designados aqui no Visão Geral)
  const { data: tceRows } = await locals.supabase
    .from('tces')
    .select('id, nome, tipo, status, prazo, publicador_id')
    .in('status', ['aberto'])
    .order('nome');
  const nomePub = new Map(publicadores.map((p) => [p.id, p.nome]));
  const tces = (tceRows ?? []).map((t: any) => ({
    id: t.id, nome: t.nome, tipo: t.tipo, status: t.status, prazo: t.prazo,
    publicador_id: t.publicador_id,
    publicador_nome: t.publicador_id ? (nomePub.get(t.publicador_id) ?? null) : null
  }));

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

  return {
    quadras,
    designacoesAbertas: abertas,
    publicadores,
    quadrasAlocadas: [...quadrasAlocadas],
    participantesPorDesignacao,
    tces,
    arranjosQuadras
  };
};

export const actions: Actions = {
  // Designa um TCE a um publicador/dirigente com prazo (mesmo lugar das designações)
  atribuirTce: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const publicadorId = String(fd.get('publicador_id') ?? '').trim() || null;
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('tces').update({ publicador_id: publicadorId, prazo, status: 'aberto' }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: publicadorId ? 'TCE designado' : 'Designação removida' };
  },

  // Admin designa direto da Geral. Dois tipos:
  // - 'pessoal' (default): território pessoal pra UM publicador trabalhar
  // - 'arranjo': delega pra um DIRIGENTE coordenar uma saída em grupo
  criarDesignacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const tipo = String(fd.get('tipo') ?? 'pessoal');
    const publicadorIds = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);
    const dirigenteId = String(fd.get('dirigente_id') ?? '').trim() || null;
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (quadrasIds.length === 0) return fail(400, { erro: 'quadras obrigatórias' });

    if (tipo === 'arranjo') {
      if (!dirigenteId) return fail(400, { erro: 'dirigente obrigatório pra arranjo' });
    } else {
      if (publicadorIds.length === 0) return fail(400, { erro: 'pelo menos 1 publicador obrigatório' });
    }

    const { data: des, error: errD } = await locals.supabase
      .from('designacoes')
      .insert({
        tipo,
        publicador_id: tipo === 'pessoal' ? publicadorIds[0] : null,
        dirigente_id: tipo === 'arranjo' ? dirigenteId : null,
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

    // Participantes (somente pessoal): N publicadores. Pro arranjo, o dirigente convida
    if (tipo === 'pessoal' && publicadorIds.length > 0) {
      const part = publicadorIds.map((pid, i) => ({
        designacao_id: des.id,
        publicador_id: pid,
        papel: i === 0 ? 'lider' : 'participante'
      }));
      await locals.supabase.from('designacao_publicadores').insert(part);
    }
    const label = tipo === 'arranjo' ? 'Arranjo delegado ao dirigente' : `Designada a ${publicadorIds.length} publicador(es)`;
    return { ok: true, msg: `${label} com ${quadrasIds.length} quadra(s)` };
  },

  encerrarDesignacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('designacoes').update({ status: 'concluida' }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Encerrada' };
  },

  editarDesignacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });

    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const publicadorIds = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);

    const { error: errU } = await locals.supabase
      .from('designacoes').update({ prazo, notas }).eq('id', id);
    if (errU) return fail(400, { erro: errU.message });

    if (quadrasIds.length > 0) {
      await locals.supabase.from('designacao_quadras').delete().eq('designacao_id', id);
      const linhas = quadrasIds.map((qid) => ({ designacao_id: id, quadra_id: qid }));
      const { error: errQ } = await locals.supabase.from('designacao_quadras').insert(linhas);
      if (errQ) return fail(400, { erro: 'Falhou ao trocar quadras: ' + errQ.message });
    }

    if (publicadorIds.length > 0) {
      await locals.supabase.from('designacao_publicadores').delete().eq('designacao_id', id);
      const part = publicadorIds.map((pid, i) => ({
        designacao_id: id, publicador_id: pid, papel: i === 0 ? 'lider' : 'participante'
      }));
      await locals.supabase.from('designacao_publicadores').insert(part);
      // Mantém o primeiro como publicador_id principal
      await locals.supabase.from('designacoes').update({ publicador_id: publicadorIds[0] }).eq('id', id);
    }
    return { ok: true, msg: 'Designação atualizada' };
  },

  // Anexa quadras selecionadas a um arranjo (tipo 'quadras'). Admin → arranjo
  // direto, sem precisar de dirigente. Junta com as quadras_ids existentes.
  adicionarQuadrasAoArranjo: async ({ request, locals }) => {
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

    const atuais = (arr.quadras_ids ?? []) as string[];
    const novas = substituir ? quadrasIds : Array.from(new Set([...atuais, ...quadrasIds]));
    const { error } = await locals.supabase
      .from('arranjos').update({ quadras_ids: novas }).eq('id', arranjoId);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${quadrasIds.length} quadra(s) anexada(s) ao arranjo` };
  }
};
