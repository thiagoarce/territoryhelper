import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import type { Campanha } from '$lib/types';
import { statusCampanha, type StatusCampanha } from '$lib/campanhas';
import { listarQuadrasComGeo, type QuadraGeo } from '$lib/server/queries';

export interface CampanhaResumo {
  id: number;
  nome: string;
  data_inicio: string;
  data_alvo: string;
  meta_semanal: number | null;
  status: StatusCampanha;
  concluidas_no_periodo: number;
  total_meta: number;
  concluidas_semana: number;
  diasParaComecar: number;
  diasRestantes: number;
  notasSuprimento: string | null;
  imagemUrl: string | null;
}

export interface ConclusaoSemana {
  semana: string;
  qtd: number;
}

export interface MetaPessoal {
  id: number;
  texto: string;
  feito: boolean;
}

export interface MinhaColaboracao {
  porTipo: Record<string, number>;
  cartasEscritas: number;
}

export const load: PageServerLoad = async ({ locals }) => {
  const [ativaRes, objetivosRes, quadras] = await Promise.all([
    locals.supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal, ativa, publicacao_id, publicacoes(imagem_url)')
      .eq('ativa', true)
      .maybeSingle(),
    locals.supabase
      .from('campanha')
      .select('*')
      .eq('publico', true)
      .order('modalidade')
      .order('ordem'),
    listarQuadrasComGeo(locals.supabase)
  ]);

  const c = ativaRes.data as any;

  let ativa: CampanhaResumo | null = null;
  let quadrasConcluidasNoPeriodo: string[] = [];
  let conclusoesSemana: ConclusaoSemana[] = [];
  let metasPessoais: MetaPessoal[] = [];
  let minhaColaboracao: MinhaColaboracao | null = null;

  if (c) {
    const concluidasNoPeriodo = quadras.filter(
      (q) => q.data_conclusao && q.data_conclusao >= c.data_inicio && q.data_conclusao <= c.data_alvo
    );
    quadrasConcluidasNoPeriodo = concluidasNoPeriodo.map((q) => q.id);

    // Semana corrente (últimos 7 dias) — pro comparativo com a meta semanal
    const ha7dias = new Date(Date.now() - 7 * 86400000).toISOString().substring(0, 10);
    const hoje = new Date().toISOString().substring(0, 10);
    const concluidasSemana = quadras.filter(
      (q) => q.data_conclusao && q.data_conclusao >= ha7dias && q.data_conclusao <= hoje && q.data_conclusao >= c.data_inicio
    ).length;
    const diasParaComecar = Math.max(0, Math.ceil(
      (new Date(c.data_inicio + 'T12:00:00').getTime() - Date.now()) / 86400000
    ));
    const diasRestantes = Math.max(0, Math.ceil(
      (new Date(c.data_alvo + 'T12:00:00').getTime() - Date.now()) / 86400000
    ));
    let notasSuprimento: string | null = null;
    if (c.publicacao_id) {
      const { data: supr } = await locals.supabase
        .from('campanha_suprimentos')
        .select('notas')
        .eq('campanha_id', c.id)
        .eq('publicacao_id', c.publicacao_id)
        .maybeSingle();
      notasSuprimento = supr?.notas ?? null;
    }
    ativa = {
      id: c.id,
      nome: c.nome,
      data_inicio: c.data_inicio,
      data_alvo: c.data_alvo,
      meta_semanal: c.meta_semanal,
      status: statusCampanha(c),
      concluidas_no_periodo: concluidasNoPeriodo.length,
      total_meta: quadras.length,
      concluidas_semana: concluidasSemana,
      diasParaComecar,
      diasRestantes,
      notasSuprimento,
      imagemUrl: c.publicacoes?.imagem_url ?? null
    };

    // Gráfico semanal — mesmo cálculo de /admin/campanha (agrupa por segunda-feira)
    const mapa = new Map<string, number>();
    for (const q of quadras) {
      if (!q.data_conclusao) continue;
      if (q.data_conclusao < c.data_inicio || q.data_conclusao > c.data_alvo) continue;
      const d = new Date(q.data_conclusao + 'T12:00:00');
      const dow = d.getDay() || 7;
      d.setDate(d.getDate() - (dow - 1));
      const key = d.toISOString().substring(0, 10);
      mapa.set(key, (mapa.get(key) || 0) + 1);
    }
    conclusoesSemana = [...mapa].map(([semana, qtd]) => ({ semana, qtd })).sort((a, b) => a.semana.localeCompare(b.semana));

    if (locals.user) {
      const [{ data: metasRows }, { data: registrosRows }, { count: cartasCount }] = await Promise.all([
        locals.supabase
          .from('campanha_metas_pessoais')
          .select('id, texto, feito')
          .eq('campanha_id', c.id)
          .eq('publicador_id', locals.user.id)
          .order('id'),
        locals.supabase
          .from('registros')
          .select('tipo')
          .eq('publicador_id', locals.user.id)
          .gte('ts', c.data_inicio)
          .lte('ts', c.data_alvo + 'T23:59:59')
          .not('tipo', 'in', '(desfeito,carta_undo)'),
        locals.supabase
          .from('unidades')
          .select('id', { count: 'exact', head: true })
          .eq('carta_escrita_por', locals.user.id)
          .gte('carta_entregue', c.data_inicio)
          .lte('carta_entregue', c.data_alvo)
      ]);
      metasPessoais = (metasRows ?? []) as MetaPessoal[];
      const porTipo: Record<string, number> = {};
      for (const r of (registrosRows ?? []) as { tipo: string }[]) {
        porTipo[r.tipo] = (porTipo[r.tipo] ?? 0) + 1;
      }
      minhaColaboracao = { porTipo, cartasEscritas: cartasCount ?? 0 };
    }
  }

  // Objetivos pertencem à campanha ativa (legados sem campanha_id continuam
  // aparecendo enquanto houver alguma ativa)
  const objetivos = ativa
    ? ((objetivosRes.data ?? []) as any[]).filter(
        (o) => o.campanha_id === ativa!.id || o.campanha_id == null
      )
    : [];

  return {
    ativa, objetivos: objetivos as Campanha[], quadras: quadras as QuadraGeo[],
    quadrasConcluidasNoPeriodo, conclusoesSemana, metasPessoais, minhaColaboracao
  };
};

export const actions: Actions = {
  criarMetaPessoal: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const campanhaId = Number(fd.get('campanha_id') ?? 0);
    const texto = String(fd.get('texto') ?? '').trim();
    if (!campanhaId || !texto) return fail(400, { erro: 'Descreva a meta' });
    const { error } = await locals.supabase.from('campanha_metas_pessoais').insert({
      campanha_id: campanhaId, publicador_id: locals.user.id, texto
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Meta adicionada' };
  },

  marcarMetaPessoal: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const feito = fd.get('feito') === 'true';
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('campanha_metas_pessoais')
      .update({ feito })
      .eq('id', id)
      .eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true };
  },

  apagarMetaPessoal: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('campanha_metas_pessoais')
      .delete()
      .eq('id', id)
      .eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Meta removida' };
  }
};
