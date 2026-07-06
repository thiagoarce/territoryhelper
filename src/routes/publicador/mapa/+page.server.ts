import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { listarQuadrasComGeo } from '$lib/server/queries';

// Visão geral READ-ONLY do território de toda a congregação — só
// dirigente/admin. Concluir quadra, repartir e POIs saíram daqui: já
// existem devidamente escopados ao território designado (Casa a casa +
// quadra/[id]) — concluir/repartir no geral é papel do admin/servo de
// território, não do dirigente. Isso aqui é só panorama.
export const load: PageServerLoad = async ({ locals }) => {
  if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
    throw error(403, 'Só dirigente/admin acessa a visão geral do território');
  }
  const quadras = await listarQuadrasComGeo(locals.supabase);
  return { quadras };
};
