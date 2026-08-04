import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Roteamento por role: cada perfil tem uma "home" diferente.
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session || !locals.profile) throw redirect(303, '/login');
  if (!locals.profile.ativo) throw redirect(303, '/login?msg=desativado');

  switch (locals.profile.role) {
    case 'admin':
      throw redirect(303, '/admin');
    // Dirigente vai DIRETO pra /publicador (modo campo é único). Mandar
    // pra /dirigente dava 404: aquela pasta só tem +layout.server.ts, e
    // diretório sem +page.svelte não é rota — o SvelteKit nem chega a
    // rodar o layout, responde 404 antes. Era o 404 que o dirigente
    // levava ao entrar pelo link de convite (a action manda pra `/`) e
    // em qualquer entrada pelo start_url do PWA.
    case 'dirigente':
    case 'publicador':
      throw redirect(303, '/publicador');
  }
};
