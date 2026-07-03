import type { Actions, PageServerLoad } from './$types';
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
}

export interface CampanhaHistorico extends CampanhaPeriodo {
  concluidas: number;
  meta_total: number | null;   // meta_semanal × semanas do período
  qtd_objetivos: number;
}

export const load: PageServerLoad = async ({ locals }) => {
  const [objRes, periodosRes, quadras, conclusoes] = await Promise.all([
    locals.supabase.from('campanha').select('*').order('modalidade').order('ordem'),
    locals.supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal, ativa')
      .order('data_inicio', { ascending: false }),
    listarQuadrasComGeo(locals.supabase),
    // Histórico append-only de conclusões — permite medir campanhas PASSADAS
    // (quadras.data_conclusao só guarda a última)
    selectAll<{ quadra_id: string; data_conclusao: string }>(
      locals.supabase.from('quadras_conclusoes').select('quadra_id, data_conclusao').order('id')
    )
  ]);
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

  return { objetivos, periodos, ativa, historico, quadras, quadrasConcluidasNoPeriodo, conclusoesSemana };
};

const MODALIDADES = ['casa', 'comercial', 'rural', 'cartas', 'telefone', 'publico'] as const;
const TIPOS = ['geral', 'semana'] as const;

export const actions: Actions = {
  criar: async ({ request, locals }) => {
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
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('campanha').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Excluído' };
  },

  // Criar/editar período da campanha
  salvarPeriodo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const nome = String(fd.get('nome') ?? '').trim();
    const dataInicio = String(fd.get('data_inicio') ?? '').trim();
    const dataAlvo = String(fd.get('data_alvo') ?? '').trim();
    const metaSemanal = Number(fd.get('meta_semanal') ?? 0) || null;
    if (!nome || !dataInicio || !dataAlvo) return fail(400, { erro: 'nome + datas obrigatórios' });
    if (id) {
      const { error } = await locals.supabase
        .from('campanhas')
        .update({ nome, data_inicio: dataInicio, data_alvo: dataAlvo, meta_semanal: metaSemanal })
        .eq('id', id);
      if (error) return fail(400, { erro: error.message });
    } else {
      // Nova campanha vira ativa por default. Desativa outras antes (unique partial index).
      await locals.supabase.from('campanhas').update({ ativa: false }).eq('ativa', true);
      const { error } = await locals.supabase
        .from('campanhas')
        .insert({ nome, data_inicio: dataInicio, data_alvo: dataAlvo, meta_semanal: metaSemanal, ativa: true });
      if (error) return fail(400, { erro: error.message });
    }
    return { ok: true, msg: 'Período salvo' };
  },

  ativarPeriodo: async ({ request, locals }) => {
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
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const { error } = await locals.supabase.from('campanhas').update({ ativa: false }).eq('ativa', true);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Sem campanha ativa' };
  }
};
