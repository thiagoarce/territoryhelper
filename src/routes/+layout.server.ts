import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

const MODULOS_PADRAO = {
  campaigns: true,
  publicWitnessing: true,
  publications: true,
  // Censo de idioma: desligado por padrão. O Installer liga quando o KML
  // traz uma malha `language-census` (ver installer/publish.ts) — quem não
  // tem grupo de idioma não precisa do menu.
  languageCensus: false
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
    // Instalação publicada ANTES do módulo de censo existir não tem a chave
    // — e o piloto já subiu com 6.763 áreas de idioma. Nesse caso (e só
    // nesse) descobrimos pela própria malha, com um `limit(1)` de um id só
    // — nunca a geometria. Depois de republicar, a chave existe e esta
    // query deixa de acontecer.
    const chaveAusente = typeof (installation?.modules as any)?.languageCensus !== 'boolean';
    if (chaveAusente && locals.profile.role === 'admin') {
      const { data: umaArea } = await locals.supabase
        .from('quadras')
        .select('id')
        .eq('finalidade', 'language-census')
        .limit(1);
      modules.languageCensus = (umaArea ?? []).length > 0;
    }
  }

  const disabledRoute =
    (!modules.publicWitnessing && (url.pathname.startsWith('/publicador/tp') || url.pathname.startsWith('/admin/tp')))
    || (!modules.publications && url.pathname.startsWith('/publicacoes'))
    || (!modules.campaigns && (url.pathname.startsWith('/publicador/campanha') || url.pathname.startsWith('/admin/campanha')))
    || (!modules.languageCensus && url.pathname.startsWith('/admin/censo'));
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
