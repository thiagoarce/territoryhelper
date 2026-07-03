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

  const ativa = ativaRes.data ?? null;
  // Objetivos pertencem à campanha ativa (legados sem campanha_id continuam
  // aparecendo enquanto houver alguma ativa)
  const objetivos = ativa
    ? ((objetivosRes.data ?? []) as any[]).filter(
        (o) => o.campanha_id === (ativa as any).id || o.campanha_id == null
      )
    : [];

  return { ativa, objetivos: objetivos as Campanha[] };
};
