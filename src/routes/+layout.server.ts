import type { LayoutServerLoad } from './$types';

// Expõe sessão + profile pra todas as páginas — usado pelo layout.svelte
// pra montar a sidebar com os links permitidos pela role.
export const load: LayoutServerLoad = async ({ locals }) => {
  // Ícone de "Casa a casa" na bottom nav só aparece se tiver algo pra
  // mostrar ali (arranjo que dirige, parte, território pessoal ou TCE
  // pessoal) — mesmo padrão do TP (profiles.tp_aprovado). RPC só faz
  // EXISTS (sem trazer linha nenhuma), CPU desprezível mesmo rodando em
  // toda navegação (migration 081).
  let temCasaACasa = false;
  if (locals.profile) {
    const { data } = await locals.supabase.rpc('tem_algo_em_casa_a_casa', {
      p_publicador_id: locals.profile.id
    });
    temCasaACasa = !!data;
  }
  return {
    session: locals.session,
    profile: locals.profile,
    temCasaACasa
  };
};
