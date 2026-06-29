import type { PageServerLoad } from './$types';
import type { Campanha } from '$lib/types';

export const load: PageServerLoad = async ({ locals }) => {
  const [ativaRes, objetivosRes] = await Promise.all([
    locals.supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal')
      .eq('ativa', true)
      .maybeSingle(),
    locals.supabase
      .from('campanha')
      .select('*')
      .eq('publico', true)
      .order('modalidade')
      .order('ordem')
  ]);

  return {
    ativa: ativaRes.data ?? null,
    objetivos: (objetivosRes.data ?? []) as Campanha[]
  };
};
