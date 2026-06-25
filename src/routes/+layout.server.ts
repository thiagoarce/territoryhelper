import type { LayoutServerLoad } from './$types';

// Expõe sessão + profile pra todas as páginas — usado pelo layout.svelte
// pra montar a sidebar com os links permitidos pela role.
export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    session: locals.session,
    profile: locals.profile
  };
};
