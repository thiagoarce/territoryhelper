import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import type { Campanha } from '$lib/types';
import { listarQuadrasComGeo } from '$lib/server/queries';

export interface CampanhaPeriodo {
  id: number;
  nome: string;
  data_inicio: string;
  data_alvo: string;
  meta_semanal: number | null;
  ativa: boolean;
}

export const load: PageServerLoad = async ({ locals }) => {
  const [objRes, periodosRes, quadras] = await Promise.all([
    locals.supabase.from('campanha').select('*').order('modalidade').order('ordem'),
    locals.supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal, ativa')
      .order('data_inicio', { ascending: false }),
    listarQuadrasComGeo(locals.supabase)
  ]);
  const objetivos = (objRes.data ?? []) as Campanha[];
  const periodos = (periodosRes.data ?? []) as CampanhaPeriodo[];
  const ativa = periodos.find((p) => p.ativa) ?? null;

  // Conclusões POR SEMANA durante o período ativo (pra gráfico)
  let conclusoesSemana: { semana: string; qtd: number }[] = [];
  let quadrasConcluidasNoPeriodo: string[] = [];
  if (ativa) {
    for (const q of quadras) {
      if (q.status === 'concluido' && q.data_conclusao
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

  return { objetivos, periodos, ativa, quadras, quadrasConcluidasNoPeriodo, conclusoesSemana };
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
    const { error } = await locals.supabase
      .from('campanha')
      .insert({ tipo, modalidade, titulo, descricao, link, publico });
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
      const { error } = await locals.supabase
        .from('campanhas')
        .insert({ nome, data_inicio: dataInicio, data_alvo: dataAlvo, meta_semanal: metaSemanal });
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
