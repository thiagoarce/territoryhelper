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
