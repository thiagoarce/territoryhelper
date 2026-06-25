import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Roteamento por role: cada perfil tem uma "home" diferente.
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session || !locals.profile) throw redirect(303, '/login');
  if (!locals.profile.ativo) throw redirect(303, '/login?msg=desativado');

  switch (locals.profile.role) {
    case 'admin':
      throw redirect(303, '/admin');
    case 'dirigente':
      throw redirect(303, '/dirigente');
    case 'publicador':
      throw redirect(303, '/publicador');
  }
};
