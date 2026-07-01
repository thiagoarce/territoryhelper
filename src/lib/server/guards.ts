// Guards reutilizáveis pra rotas server-side. Use em +layout.server.ts
// das pastas /admin, /dirigente, /publicador.
import { redirect, error } from '@sveltejs/kit';
import type { Role } from '$lib/types';

export function exigirRole(locals: App.Locals, rolesPermitidas: Role[]) {
  if (!locals.session || !locals.profile) throw redirect(303, '/login');
  if (!locals.profile.ativo) throw redirect(303, '/login?msg=desativado');
  if (!rolesPermitidas.includes(locals.profile.role)) {
    throw error(403, 'Acesso negado pra essa área.');
  }
}

// Confere se o usuário logado tem posse da quadra (via designação ativa ou
// arranjo ativo que a inclui). Admin sempre passa. Se não passar, lança 403.
// Defesa em profundidade além do RLS.
export async function exigirQuadraDesignada(locals: App.Locals, quadraId: string): Promise<void> {
  if (!locals.session || !locals.user || !locals.profile) throw redirect(303, '/login');
  if (locals.profile.role === 'admin' || locals.profile.role === 'dirigente') return;

  // Publicador: precisa ter designação ativa com essa quadra, ou estar em
  // arranjo ativo cuja quadras_ids contenha ela.
  const userId = locals.user.id;

  const { data: dq } = await locals.supabase
    .from('designacao_quadras')
    .select('designacao_id, designacoes!inner(publicador_id, status)')
    .eq('quadra_id', quadraId)
    .eq('designacoes.publicador_id', userId)
    .eq('designacoes.status', 'aberta')
    .limit(1);
  if (dq && dq.length > 0) return;

  const { data: arr } = await locals.supabase
    .from('arranjos')
    .select('id')
    .eq('ativo', true)
    .contains('quadras_ids', [quadraId])
    .or(`dirigente_id.eq.${userId}`)
    .limit(1);
  if (arr && arr.length > 0) return;

  throw error(403, 'Você não tem essa quadra designada.');
}
