import type { PageServerLoad } from './$types';
import { selectAll } from '$lib/server/queries';
import type { ArranjoBase } from '$lib/arranjos';

export interface ArranjoLinha extends ArranjoBase {}

export interface ModalidadeLite {
  id: number;
  nome: string;
  tipo_territorio: string;
  cor: string;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return { arranjos: [], modalidades: [], dirigentes: {} };

  const [arranjos, modalidades, { data: profs }] = await Promise.all([
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
    locals.supabase.from('profiles').select('id, nome').in('role', ['dirigente', 'admin'])
  ]);

  const dirigentes: Record<string, string> = {};
  for (const p of profs ?? []) dirigentes[p.id] = p.nome;

  return { arranjos, modalidades, dirigentes };
};
