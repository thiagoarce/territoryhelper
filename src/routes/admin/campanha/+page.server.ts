import type { Actions, PageServerLoad } from './$types';
import { exigirAdminAction } from '$lib/server/guards';
import { fail } from '@sveltejs/kit';
import type { Campanha } from '$lib/types';
import { listarQuadrasComGeo, selectAll } from '$lib/server/queries';

export interface CampanhaPeriodo {
  id: number;
  nome: string;
  data_inicio: string;
  data_alvo: string;
  meta_semanal: number | null;
  ativa: boolean;
  publicacao_id: number | null;
}

export interface Publicacao {
  id: number;
  nome: string;
  codigo: string | null;
  ativo: boolean;
}

export interface Suprimento {
  id: number;
  campanha_id: number;
  publicacao_id: number;
  publicacao_nome: string;
  qtd_necessaria: number;
  qtd_estoque: number; // A17: lido do catálogo (publicacoes.qtd_estoque), não mais digitado aqui
  pedido_feito: boolean;
  notas: string | null;
}

export interface CampanhaHistorico extends CampanhaPeriodo {
  concluidas: number;
  meta_total: number | null;   // meta_semanal × semanas do período
  qtd_objetivos: number;
}

export const load: PageServerLoad = async ({ locals }) => {
  const [objRes, periodosRes, quadras, conclusoes, publicacoesRes] = await Promise.all([
    locals.supabase.from('campanha').select('*').order('modalidade').order('ordem'),
    locals.supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal, ativa, publicacao_id')
      .order('data_inicio', { ascending: false }),
    listarQuadrasComGeo(locals.supabase),
    // Histórico append-only de conclusões — permite medir campanhas PASSADAS
    // (quadras.data_conclusao só guarda a última)
    selectAll<{ quadra_id: string; data_conclusao: string }>(
      locals.supabase.from('quadras_conclusoes').select('quadra_id, data_conclusao').order('id')
    ),
    locals.supabase.from('publicacoes').select('*').order('nome')
  ]);
  const publicacoes = (publicacoesRes.data ?? []) as Publicacao[];
  const todosObjetivos = (objRes.data ?? []) as Campanha[];
  const periodos = (periodosRes.data ?? []) as CampanhaPeriodo[];
  // SEM fallback: desativar significa desativar. Nenhuma ativa = tela mostra isso.
  const ativa = periodos.find((p) => p.ativa) ?? null;

  // Objetivos SEMPRE pertencem a uma campanha; a tela mostra os da ativa
  // (legados com campanha_id null aparecem junto pra não sumir dado antigo)
  const objetivos = todosObjetivos.filter(
    (o: any) => (ativa && o.campanha_id === ativa.id) || o.campanha_id == null
  );

  // Conclusões DISTINTAS (quadra única) dentro de um período
  function concluidasNoPeriodo(inicio: string, alvo: string): number {
    const set = new Set<string>();
    for (const c of conclusoes) {
      if (c.data_conclusao >= inicio && c.data_conclusao <= alvo) set.add(c.quadra_id);
    }
    return set.size;
  }
  function semanasDoPeriodo(inicio: string, alvo: string): number {
    const ms = new Date(alvo + 'T12:00:00').getTime() - new Date(inicio + 'T12:00:00').getTime();
    return Math.max(1, Math.ceil(ms / (7 * 86400000)));
  }

  // Histórico: campanhas passadas/inativas com resultado (cumprimos a meta?)
  const historico: CampanhaHistorico[] = periodos
    .filter((p) => !p.ativa)
    .map((p) => ({
      ...p,
      concluidas: concluidasNoPeriodo(p.data_inicio, p.data_alvo),
      meta_total: p.meta_semanal ? p.meta_semanal * semanasDoPeriodo(p.data_inicio, p.data_alvo) : null,
      qtd_objetivos: todosObjetivos.filter((o: any) => o.campanha_id === p.id).length
    }));

  // Termômetro de ritmo — tudo computável com o que já existe (sem schema novo)
  let ritmo: {
    metaTotal: number | null;
    concluidas: number;
    faltam: number | null;
    diasDecorridos: number;
    diasRestantes: number;
    ritmoAtual: number;
    ritmoNecessario: number | null;
    status: 'ok' | 'atencao' | 'risco' | 'sem_meta';
    projecaoIso: string | null;
  } | null = null;
  if (ativa) {
    const metaTotal = ativa.meta_semanal ? ativa.meta_semanal * semanasDoPeriodo(ativa.data_inicio, ativa.data_alvo) : null;
    const concluidasAtiva = concluidasNoPeriodo(ativa.data_inicio, ativa.data_alvo);
    const hojeMs = Date.now();
    const inicioMs = new Date(ativa.data_inicio + 'T12:00:00').getTime();
    const alvoMs = new Date(ativa.data_alvo + 'T12:00:00').getTime();
    const diasDecorridos = Math.max(1, Math.ceil((hojeMs - inicioMs) / 86400000));
    const diasRestantes = Math.max(0, Math.ceil((alvoMs - hojeMs) / 86400000));
    const ritmoAtual = concluidasAtiva / diasDecorridos;
    const faltam = metaTotal != null ? Math.max(0, metaTotal - concluidasAtiva) : null;
    const ritmoNecessario = faltam != null && diasRestantes > 0 ? faltam / diasRestantes : (faltam === 0 ? 0 : null);

    let status: 'ok' | 'atencao' | 'risco' | 'sem_meta' = 'sem_meta';
    if (ritmoNecessario != null) {
      if (ritmoAtual >= ritmoNecessario) status = 'ok';
      else if (ritmoNecessario > 0 && ritmoAtual >= ritmoNecessario * 0.7) status = 'atencao';
      else status = 'risco';
    }

    let projecaoIso: string | null = null;
    if (faltam != null && ritmoAtual > 0) {
      const diasProjetados = Math.ceil(faltam / ritmoAtual);
      projecaoIso = new Date(hojeMs + diasProjetados * 86400000).toISOString().substring(0, 10);
    }

    ritmo = { metaTotal, concluidas: concluidasAtiva, faltam, diasDecorridos, diasRestantes, ritmoAtual, ritmoNecessario, status, projecaoIso };
  }

  // Conclusões POR SEMANA durante o período ativo (pra gráfico)
  let conclusoesSemana: { semana: string; qtd: number }[] = [];
  let quadrasConcluidasNoPeriodo: string[] = [];
  if (ativa) {
    for (const q of quadras) {
      if (q.data_conclusao
          && q.data_conclusao >= ativa.data_inicio && q.data_conclusao <= ativa.data_alvo) {
        quadrasConcluidasNoPeriodo.push(q.id);
      }
    }
    // Agrupa por semana (segunda-feira)
    const mapa = new Map<string, number>();
    for (const q of quadras) {
      if (!q.data_conclusao) continue;
      if (q.data_conclusao < ativa.data_inicio || q.data_conclusao > ativa.data_alvo) continue;
      const d = new Date(q.data_conclusao + 'T12:00:00');
      // Segunda da semana
      const dow = d.getDay() || 7; // domingo = 7
      d.setDate(d.getDate() - (dow - 1));
      const key = d.toISOString().substring(0, 10);
      mapa.set(key, (mapa.get(key) || 0) + 1);
    }
    conclusoesSemana = [...mapa].map(([semana, qtd]) => ({ semana, qtd }))
      .sort((a, b) => a.semana.localeCompare(b.semana));
  }

  // Suprimento da campanha ativa — checklist publicação × necessária × em mãos
  let suprimentos: Suprimento[] = [];
  if (ativa) {
    const { data: suprRows } = await locals.supabase
      .from('campanha_suprimentos')
      .select('id, campanha_id, publicacao_id, qtd_necessaria, pedido_feito, notas, publicacoes!inner(nome, qtd_estoque)')
      .eq('campanha_id', ativa.id);
    suprimentos = ((suprRows ?? []) as any[]).map((s) => ({
      id: s.id,
      campanha_id: s.campanha_id,
      publicacao_id: s.publicacao_id,
      publicacao_nome: s.publicacoes?.nome ?? '?',
      qtd_necessaria: s.qtd_necessaria,
      qtd_estoque: s.publicacoes?.qtd_estoque ?? 0,
      pedido_feito: s.pedido_feito,
      notas: s.notas
    }));
  }

  return { objetivos, periodos, ativa, historico, quadras, quadrasConcluidasNoPeriodo, conclusoesSemana, ritmo, publicacoes, suprimentos };
};

const MODALIDADES = ['casa', 'comercial', 'rural', 'cartas', 'telefone', 'publico'] as const;
const TIPOS = ['geral', 'semana'] as const;

export const actions: Actions = {
  criar: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const tipo = String(fd.get('tipo') ?? '');
    const modalidade = String(fd.get('modalidade') ?? '');
    const titulo = String(fd.get('titulo') ?? '').trim();
    const descricao = String(fd.get('descricao') ?? '').trim() || null;
    const link = String(fd.get('link') ?? '').trim() || null;
    const publico = fd.get('publico') === 'on';
    if (!TIPOS.includes(tipo as any)) return fail(400, { erro: 'Tipo inválido' });
    if (!MODALIDADES.includes(modalidade as any)) return fail(400, { erro: 'Modalidade inválida' });
    if (!titulo) return fail(400, { erro: 'Título obrigatório' });

    // Objetivo sempre pertence a uma campanha — a ativa no momento da criação
    const { data: ativa } = await locals.supabase
      .from('campanhas').select('id').eq('ativa', true).maybeSingle();
    if (!ativa) return fail(400, { erro: 'Nenhuma campanha ativa — crie/ative um período antes de adicionar objetivos' });

    const { error } = await locals.supabase
      .from('campanha')
      .insert({ tipo, modalidade, titulo, descricao, link, publico, campanha_id: ativa.id });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Objetivo criado' };
  },

  atualizar: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const titulo = String(fd.get('titulo') ?? '').trim();
    const descricao = String(fd.get('descricao') ?? '').trim() || null;
    const link = String(fd.get('link') ?? '').trim() || null;
    const publico = fd.get('publico') === 'on';
    if (!id || !titulo) return fail(400, { erro: 'id e título obrigatórios' });
    const { error } = await locals.supabase
      .from('campanha')
      .update({ titulo, descricao, link, publico })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Atualizado' };
  },

  excluir: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('campanha').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Excluído' };
  },

  // Criar/editar período da campanha
  salvarPeriodo: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const nome = String(fd.get('nome') ?? '').trim();
    const dataInicio = String(fd.get('data_inicio') ?? '').trim();
    const dataAlvo = String(fd.get('data_alvo') ?? '').trim();
    const metaSemanal = Number(fd.get('meta_semanal') ?? 0) || null;
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0) || null;
    if (!nome || !dataInicio || !dataAlvo) return fail(400, { erro: 'nome + datas obrigatórios' });
    let campanhaId = id;
    if (id) {
      const { error } = await locals.supabase
        .from('campanhas')
        .update({ nome, data_inicio: dataInicio, data_alvo: dataAlvo, meta_semanal: metaSemanal, publicacao_id: publicacaoId })
        .eq('id', id);
      if (error) return fail(400, { erro: error.message });
    } else {
      // Nova campanha vira ativa por default. Desativa outras antes (unique partial index).
      await locals.supabase.from('campanhas').update({ ativa: false }).eq('ativa', true);
      const { data: nova, error } = await locals.supabase
        .from('campanhas')
        .insert({ nome, data_inicio: dataInicio, data_alvo: dataAlvo, meta_semanal: metaSemanal, publicacao_id: publicacaoId, ativa: true })
        .select('id')
        .single();
      if (error) return fail(400, { erro: error.message });
      campanhaId = nova.id;
    }
    // Publicação principal entra sozinha no checklist de suprimento (specs
    // 1.6) — sem isso a nota "levar X" do card da campanha na home do campo
    // nunca aparece (ela lê campanha_suprimentos filtrando por essa
    // publicação). Idempotente: só cria se ainda não existe a linha.
    if (publicacaoId && campanhaId) {
      const { data: jaExiste } = await locals.supabase
        .from('campanha_suprimentos')
        .select('id')
        .eq('campanha_id', campanhaId)
        .eq('publicacao_id', publicacaoId)
        .maybeSingle();
      if (!jaExiste) {
        await locals.supabase
          .from('campanha_suprimentos')
          .insert({ campanha_id: campanhaId, publicacao_id: publicacaoId });
      }
    }
    return { ok: true, msg: 'Período salvo' };
  },

  ativarPeriodo: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    // Desativa todas, depois ativa essa (unique partial index garante)
    await locals.supabase.from('campanhas').update({ ativa: false }).neq('id', id);
    const { error } = await locals.supabase.from('campanhas').update({ ativa: true }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Campanha ativa' };
  },

  desativarPeriodo: async ({ locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const { error } = await locals.supabase.from('campanhas').update({ ativa: false }).eq('ativa', true);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Sem campanha ativa' };
  },

  // Catálogo de publicações (sheet dentro da tela — não merece rota própria)
  criarPublicacao: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const codigo = String(fd.get('codigo') ?? '').trim() || null;
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const { error } = await locals.supabase.from('publicacoes').insert({ nome, codigo });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Publicação criada' };
  },

  atualizarPublicacao: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const nome = String(fd.get('nome') ?? '').trim();
    const codigo = String(fd.get('codigo') ?? '').trim() || null;
    const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true';
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const { error } = await locals.supabase.from('publicacoes').update({ nome, codigo, ativo }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Publicação atualizada' };
  },

  // Suprimento: linha campanha × publicação (necessária/em mãos/pedido)
  criarSuprimento: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const campanhaId = Number(fd.get('campanha_id') ?? 0);
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0);
    const qtdNecessaria = Number(fd.get('qtd_necessaria') ?? 0);
    if (!campanhaId || !publicacaoId) return fail(400, { erro: 'campanha e publicação obrigatórias' });
    const { error } = await locals.supabase.from('campanha_suprimentos').insert({
      campanha_id: campanhaId, publicacao_id: publicacaoId, qtd_necessaria: qtdNecessaria
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Suprimento adicionado' };
  },

  atualizarSuprimento: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const qtdNecessaria = Number(fd.get('qtd_necessaria') ?? 0);
    const pedidoFeito = fd.get('pedido_feito') === 'on' || fd.get('pedido_feito') === 'true';
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const { error } = await locals.supabase
      .from('campanha_suprimentos')
      .update({ qtd_necessaria: qtdNecessaria, pedido_feito: pedidoFeito, notas })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Suprimento atualizado' };
  },

  apagarSuprimento: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('campanha_suprimentos').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Suprimento removido' };
  }
};
