import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { selectAll, listarPublicadores, listarQuadrasComGeo } from '$lib/server/queries';
import type { QuadraGeo } from '$lib/server/queries';
import type { ArranjoBase } from '$lib/arranjos';
import type { AgendamentoBase, ExcecaoBase } from '$lib/tp-agendamentos';
import { criarNotificacao } from '$lib/server/push';

export interface ArranjoLinha extends ArranjoBase {}

export interface TpPontoLite {
  id: number;
  nome: string;
  endereco: string | null;
}

export interface TpCarrinhoLite {
  id: number;
  nome: string;
  tipo_id: number;
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
}

export interface ModalidadeLite {
  id: number;
  nome: string;
  tipo_territorio: string;
  cor: string;
}

export interface PredioChip {
  id: number;
  logradouro: string | null;
  numero: string | null;
  nome: string | null;
  qtd_aptos: number;
  qtd_entregues: number;
}

export interface ParteLinha {
  id: number;
  arranjo_id: number;
  quadras_ids: string[];
  locais_ids: number[];
  publicadores: string[];
  notas: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return {
    arranjos: [], modalidades: [], dirigentes: {}, prediosMap: {} as Record<number, PredioChip>,
    publicadores: [], partes: [] as ParteLinha[], nomesPorId: {} as Record<string, string>,
    tcesMap: {} as Record<string, string>, quadrasGeo: [] as QuadraGeo[], minhaId: '', podeCoordenar: false,
    tpAgendamentos: [] as AgendamentoBase[], tpExcecoes: [] as ExcecaoBase[],
    tpCarrinhos: {} as Record<number, TpCarrinhoLite>, tpPontos: {} as Record<number, TpPontoLite>,
    tpParticipantes: [] as TpParticipanteLinha[], minhaDisponibilidadeVazia: false,
    tpPecasCatalogo: [] as TpPecaCatalogoLite[], campanhaPublicacao: null as CampanhaPublicacaoLite | null,
    tpRelatorios: [] as TpRelatorioLinha[]
  };

  const podeCoordenar = ['dirigente', 'admin'].includes(locals.profile?.role ?? '');

  const escalaAte = new Date(Date.now() + 370 * 86400000).toISOString().slice(0, 10);
  const escalaDesde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [arranjos, modalidades, { data: profs }, publicadores, partesRes, tpAgendamentosRes, tpExcecoesRes, tpCarrinhosRes, tpPontosRes, tpParticipantesRes, tpDispRes, tpPecasRes, campanhaAtivaRes, tpRelatoriosRes] = await Promise.all([
    selectAll<ArranjoLinha>(
      locals.supabase
        .from('arranjos')
        .select('*')
        .eq('ativo', true)
        .order('dia_semana', { nullsFirst: false })
        .order('hora_inicio', { nullsFirst: false })
    ),
    selectAll<ModalidadeLite>(
      locals.supabase.from('arranjo_modalidades').select('id, nome, tipo_territorio, cor')
    ),
    // Todos os profiles pra resolver nomes (dirigentes E membros de partes)
    locals.supabase.from('profiles').select('id, nome, role'),
    podeCoordenar ? listarPublicadores(locals.supabase) : Promise.resolve([]),
    // Partes dos arranjos (RLS: publicador vê as dele; dirigente/admin veem todas)
    locals.supabase
      .from('arranjo_partes')
      .select('id, arranjo_id, quadras_ids, locais_ids, publicadores, notas')
      .order('criada_em'),
    // Agendamentos de TP (carrinho-centrico, TP-F) — intercalados na Agenda
    locals.supabase.from('tp_agendamentos').select('*').eq('ativo', true),
    locals.supabase.from('tp_agendamento_excecoes').select('*'),
    locals.supabase.from('tp_carrinhos').select('id, nome, tipo_id'),
    locals.supabase.from('tp_pontos').select('id, nome, endereco').eq('ativo', true),
    selectAll<TpParticipanteLinha>(
      locals.supabase.from('tp_agendamento_participantes').select('agendamento_id, data, publicador_id')
        .gte('data', escalaDesde).lte('data', escalaAte)
    ),
    // TP-B: card "Informe sua disponibilidade" só aparece se ainda não cadastrou nada
    locals.supabase
      .from('tp_disponibilidade')
      .select('id', { count: 'exact', head: true })
      .eq('publicador_id', locals.user.id),
    // TP-D: checklist de peças por tipo de carrinho, pro relatório de fim de agendamento
    locals.supabase
      .from('tp_pecas_catalogo')
      .select('id, tipo_id, nome, categoria, publicacao_id, ordem')
      .eq('ativo', true)
      .order('tipo_id')
      .order('ordem'),
    // Publicação principal da campanha ativa — entra no checklist (spec TP-D)
    locals.supabase
      .from('campanhas')
      .select('publicacao_id, publicacoes(nome)')
      .eq('ativa', true)
      .not('publicacao_id', 'is', null)
      .maybeSingle(),
    // Relatórios já enviados na janela visível (1 por ocorrência — quem
    // mandou primeiro "dono"; outros veem em modo leitura)
    locals.supabase
      .from('tp_relatorios')
      .select('agendamento_id, data, publicador_id, notas, tp_relatorio_itens(peca_id, estado, qtd_colocada, obs)')
      .gte('data', escalaDesde).lte('data', escalaAte)
  ]);

  const tpAgendamentos = (tpAgendamentosRes.data ?? []) as AgendamentoBase[];
  const tpExcecoes = (tpExcecoesRes.data ?? []) as ExcecaoBase[];
  const tpCarrinhos: Record<number, TpCarrinhoLite> = {};
  for (const c of (tpCarrinhosRes.data ?? []) as any[]) tpCarrinhos[c.id] = { id: c.id, nome: c.nome, tipo_id: c.tipo_id };
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

  const dirigentes: Record<string, string> = {};
  const nomesPorId: Record<string, string> = {};
  for (const p of profs ?? []) {
    nomesPorId[p.id] = p.nome;
    if (p.role === 'dirigente' || p.role === 'admin') dirigentes[p.id] = p.nome;
  }

  const partes = (partesRes.data ?? []) as ParteLinha[];

  // Nomes de TCEs referenciados (arranjo misto)
  const tceIds = Array.from(new Set(arranjos.map((a: any) => a.tce_id).filter(Boolean)));
  const tcesMap: Record<string, string> = {};
  if (tceIds.length > 0) {
    const { data: tces } = await locals.supabase.from('tces').select('id, nome').in('id', tceIds);
    for (const t of (tces ?? []) as any[]) tcesMap[t.id] = t.nome;
  }

  // Geometria das quadras referenciadas pelos arranjos — pro mini-mapa do
  // sheet Repartir (só dirigente/admin usam; poupa payload do publicador)
  let quadrasGeo: QuadraGeo[] = [];
  if (podeCoordenar) {
    const idsUsados = new Set(arranjos.flatMap((a) => a.quadras_ids ?? []));
    if (idsUsados.size > 0) {
      const todas = await listarQuadrasComGeo(locals.supabase);
      quadrasGeo = todas.filter((q) => idsUsados.has(q.id));
    }
  }

  // Coleta ids únicos de prédios referenciados nos arranjos e busca detalhes + stats
  const predioIds = Array.from(
    new Set(arranjos.flatMap((a) => a.cartas_locais_ids ?? []).filter((n) => Number.isFinite(n)))
  );
  const prediosMap: Record<number, PredioChip> = {};
  if (predioIds.length > 0) {
    const [locaisRes, unidsRes] = await Promise.all([
      locals.supabase.from('locais').select('id, logradouro, numero, nome').in('id', predioIds),
      selectAll<{ local_id: number; carta_entregue: string | null }>(
        locals.supabase.from('unidades').select('local_id, carta_entregue').in('local_id', predioIds)
      )
    ]);
    const stats: Record<number, { qtd: number; ent: number }> = {};
    for (const u of unidsRes) {
      const s = (stats[u.local_id] ||= { qtd: 0, ent: 0 });
      s.qtd++;
      if (u.carta_entregue) s.ent++;
    }
    for (const l of (locaisRes.data ?? []) as any[]) {
      const s = stats[l.id] ?? { qtd: 0, ent: 0 };
      prediosMap[l.id] = {
        id: l.id,
        logradouro: l.logradouro,
        numero: l.numero,
        nome: l.nome,
        qtd_aptos: s.qtd,
        qtd_entregues: s.ent
      };
    }
  }

  return {
    arranjos, modalidades, dirigentes, prediosMap, publicadores, partes, nomesPorId, tcesMap, quadrasGeo,
    minhaId: locals.user.id, podeCoordenar, tpAgendamentos, tpExcecoes, tpCarrinhos, tpPontos, tpParticipantes,
    minhaDisponibilidadeVazia: (tpDispRes.count ?? 0) === 0,
    tpPecasCatalogo, campanhaPublicacao, tpRelatorios
  };
};

export const actions: Actions = {
  // Assume dirigência de um arranjo aberto (specs Fase 3 — só dirigente/admin)
  assumirArranjo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin pode assumir arranjo' });
    }
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });

    const { data: arr, error: errA } = await locals.supabase
      .from('arranjos').select('id, nome, dirigente_id').eq('id', arranjoId).single();
    if (errA || !arr) return fail(404, { erro: 'Arranjo não encontrado' });
    if (arr.dirigente_id === locals.user.id) return fail(400, { erro: 'Você já é o dirigente' });

    const { error: errUp } = await locals.supabase
      .from('arranjos').update({ dirigente_id: locals.user.id }).eq('id', arranjoId);
    if (errUp) return fail(400, { erro: errUp.message });

    if (arr.nome && arr.dirigente_id) {
      await locals.supabase
        .from('designacoes')
        .update({ dirigente_id: locals.user.id })
        .eq('status', 'aberta')
        .eq('dirigente_id', arr.dirigente_id)
        .ilike('notas', `%${arr.nome}%`);
    }
    return { ok: true, msg: `Você é o novo dirigente de "${arr.nome ?? 'arranjo'}"` };
  },

  // Reparte o território do arranjo: cria uma PARTE (subconjunto de
  // quadras/prédios → 1+ publicadores; dupla/trio compartilham a mesma
  // parte). Substitui o antigo distribuirQuadras — não cria designações.
  criarParte: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin pode repartir' });
    }
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    const publicadorIds = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const locaisIds = fd.getAll('locais_ids').map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });
    if (publicadorIds.length === 0) return fail(400, { erro: 'Selecione ao menos um publicador' });
    if (quadrasIds.length === 0 && locaisIds.length === 0) {
      return fail(400, { erro: 'Selecione ao menos uma quadra ou prédio' });
    }

    const ehAdmin = locals.profile?.role === 'admin';
    const { data: arr, error: errA } = await locals.supabase
      .from('arranjos')
      .select('id, nome, quadras_ids, cartas_locais_ids, dirigente_id')
      .eq('id', arranjoId).single();
    if (errA || !arr) return fail(400, { erro: 'Arranjo não encontrado' });
    if (!ehAdmin && arr.dirigente_id !== locals.user.id) {
      return fail(403, { erro: 'Você não é o dirigente desse arranjo' });
    }

    // Parte tem que ser subconjunto do território do arranjo
    const quadrasArr = new Set((arr.quadras_ids ?? []) as string[]);
    const locaisArr = new Set((arr.cartas_locais_ids ?? []) as number[]);
    const foraQ = quadrasIds.filter((q) => !quadrasArr.has(q));
    const foraL = locaisIds.filter((l) => !locaisArr.has(l));
    if (foraQ.length > 0 || foraL.length > 0) {
      return fail(400, { erro: 'Itens fora do território do arranjo: ' + [...foraQ, ...foraL].join(', ') });
    }

    const { error } = await locals.supabase.from('arranjo_partes').insert({
      arranjo_id: arranjoId,
      quadras_ids: quadrasIds,
      locais_ids: locaisIds,
      publicadores: publicadorIds,
      notas,
      criado_por: locals.user.id
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `Parte criada pra ${publicadorIds.length} publicador(es)` };
  },

  // Gera link público /t/<token> do arranjo (pra WhatsApp — quem não abre o app)
  gerarLinkTerritorio: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });
    const { data, error } = await locals.supabase
      .from('territorio_tokens')
      .insert({ arranjo_id: arranjoId, criado_por: locals.user.id })
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, token: data.token };
  },

  apagarParte: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });

    // Dirigente só apaga partes de arranjos dele
    if (locals.profile?.role !== 'admin') {
      const { data: pt } = await locals.supabase
        .from('arranjo_partes')
        .select('id, arranjos!inner(dirigente_id)')
        .eq('id', id)
        .maybeSingle();
      if (!pt || (pt as any).arranjos?.dirigente_id !== locals.user.id) {
        return fail(403, { erro: 'Essa parte não é de um arranjo seu' });
      }
    }

    const { error } = await locals.supabase.from('arranjo_partes').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Parte removida' };
  },

  // Inscrição antecipada — sinal de interesse, não cria parte automaticamente.
  // Qualquer publicador autenticado pode se marcar/desmarcar. RLS de arranjos
  // é admin-only pra UPDATE, então isso passa pela RPC security definer
  // (migration 035) que só mexe no próprio uid dentro de interessados.
  toggleInteresse: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });

    const { data, error } = await locals.supabase
      .rpc('toggle_interesse_arranjo', { p_arranjo_id: arranjoId });
    if (error) return fail(400, { erro: error.message });
    const interessado = !!data;
    return { ok: true, msg: interessado ? 'Interesse registrado' : 'Interesse removido', interessado };
  },

  // Inscrição num agendamento de TP numa data concreta. Sem vaga/capacidade
  // (TP-F) — quantos entrarem, entram.
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

    // Saída em cima da hora (< 48h) — avisa o admin pra achar reposição a tempo.
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
  // criador ou admin editar depois). `itens` vem em JSON porque é uma
  // lista de tamanho variável (checklist do tipo do carrinho) — não cabe
  // bem em campos de form planos.
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

    // Só quem estava na ocorrência (inscrito ou designado) pode relatar
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

    // Item "virtual" da publicação principal da campanha: garante que
    // existe uma linha real em tp_pecas_catalogo (peca_id é NOT NULL em
    // tp_relatorio_itens) antes de gravar — cria sob demanda, 1x.
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
      // RLS bloqueia update se já existe relatório de OUTRO participante —
      // mensagem amigável em vez do erro cru do Postgres.
      return fail(409, { erro: 'Já existe relatório desse turno enviado por outro participante' });
    }

    // Substitui os itens (replace simples — sem diff, é só um checklist curto)
    await locals.supabase.from('tp_relatorio_itens').delete().eq('relatorio_id', relatorio.id);
    const { error: errItens } = await locals.supabase
      .from('tp_relatorio_itens')
      .insert(itens.map((it) => ({ relatorio_id: relatorio.id, ...it })));
    if (errItens) return fail(400, { erro: errItens.message });

    return { ok: true, msg: 'Relatório enviado' };
  },

  // TP-E: publicador sugere um ponto de TP na área dele — entra pendente
  // pro admin validar (RLS tp_pontos_sugerir exige exatamente esse shape).
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
  }
};
