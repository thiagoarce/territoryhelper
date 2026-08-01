import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

const MODULOS_PADRAO = {
  campaigns: true,
  publicWitnessing: true,
  publications: true
};

// Expõe sessão + profile pra todas as páginas — usado pelo layout.svelte
// pra montar a sidebar com os links permitidos pela role.
export const load: LayoutServerLoad = async ({ locals, url }) => {
  let modules = { ...MODULOS_PADRAO };
  if (locals.profile) {
    const { data: installation } = await locals.supabase
      .from('installation_config')
      .select('modules')
      .eq('singleton', true)
      .maybeSingle();
    if (installation?.modules && typeof installation.modules === 'object') {
      modules = { ...modules, ...(installation.modules as Partial<typeof MODULOS_PADRAO>) };
    }
  }

  const disabledRoute =
    (!modules.publicWitnessing && (url.pathname.startsWith('/publicador/tp') || url.pathname.startsWith('/admin/tp')))
    || (!modules.publications && url.pathname.startsWith('/publicacoes'))
    || (!modules.campaigns && (url.pathname.startsWith('/publicador/campanha') || url.pathname.startsWith('/admin/campanha')));
  if (disabledRoute) throw redirect(303, '/publicador?aviso=recurso-indisponivel');
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
    temCasaACasa,
    modules
  };
};
