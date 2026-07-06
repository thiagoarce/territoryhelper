import type { PageServerLoad } from './$types';
import type { Campanha } from '$lib/types';
import { statusCampanha, type StatusCampanha } from '$lib/campanhas';

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

export const load: PageServerLoad = async ({ locals }) => {
  const [ativaRes, objetivosRes, quadrasRes] = await Promise.all([
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
    // Só id + data_conclusao — suficiente pro progresso, sem carregar geometria
    locals.supabase.from('quadras').select('id, data_conclusao')
  ]);

  const c = ativaRes.data as any;

  let ativa: CampanhaResumo | null = null;
  if (c) {
    const quadras = (quadrasRes.data ?? []) as { id: string; data_conclusao: string | null }[];
    const concluidasNoPeriodo = quadras.filter(
      (q) => q.data_conclusao && q.data_conclusao >= c.data_inicio && q.data_conclusao <= c.data_alvo
    ).length;
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
      concluidas_no_periodo: concluidasNoPeriodo,
      total_meta: quadras.length,
      concluidas_semana: concluidasSemana,
      diasParaComecar,
      diasRestantes,
      notasSuprimento,
      imagemUrl: c.publicacoes?.imagem_url ?? null
    };
  }

  // Objetivos pertencem à campanha ativa (legados sem campanha_id continuam
  // aparecendo enquanto houver alguma ativa)
  const objetivos = ativa
    ? ((objetivosRes.data ?? []) as any[]).filter(
        (o) => o.campanha_id === ativa!.id || o.campanha_id == null
      )
    : [];

  return { ativa, objetivos: objetivos as Campanha[] };
};
