// Guards reutilizáveis pra rotas server-side. Use em +layout.server.ts
// das pastas /admin, /dirigente, /publicador.
import { redirect, error, fail } from '@sveltejs/kit';
import type { Role } from '$lib/types';
import { podeTrabalharQuadra } from './posse';
import { arranjoAindaVale } from '$lib/arranjos';
import { hojeIsoBrasil } from '$lib/utils/data';

export function exigirRole(locals: App.Locals, rolesPermitidas: Role[]) {
  if (!locals.session || !locals.profile) throw redirect(303, '/login');
  if (!locals.profile.ativo) throw redirect(303, '/login?msg=desativado');
  if (!rolesPermitidas.includes(locals.profile.role)) {
    throw error(403, 'Acesso negado pra essa área.');
  }
}

// Guard de ACTION (não de load): no SvelteKit, uma form action roda ANTES
// do load do +layout.server.ts — o guard do layout /admin NÃO protege as
// actions contra POST direto. Toda action mutante de rota admin precisa se
// auto-guardar com isso no topo:
//   const guard = exigirAdminAction(locals); if (guard) return guard;
export function exigirAdminAction(locals: App.Locals) {
  if (!locals.user) return fail(401, { erro: 'Não autenticado' });
  if (locals.profile?.role !== 'admin') return fail(403, { erro: 'Só admin' });
  return null;
}

// Confere se o usuário logado tem posse da quadra. Admin/dirigente passam.
// Publicador passa se: designação aberta com a quadra (líder ou
// participante), OU parte de arranjo cobrindo a quadra, OU tem parte em
// QUALQUER quadra do mesmo arranjo (saída de grupo — quem tem parte na
// saída ajuda em qualquer quadra dela, não só na sua). Espelha exatamente
// `pode_editar_local` (RLS, migration 040) — antes dessa migration essa
// última cláusula não tinha contrapartida na RLS: o guard deixava abrir a
// rota pra "qualquer publicador de qualquer arranjo ativo contendo a
// quadra" (sem checar vínculo nenhum), mas a escrita sempre falhava calada
// na RLS, dando sucesso falso pro publicador.
export async function exigirQuadraDesignada(locals: App.Locals, quadraId: string): Promise<void> {
  if (!locals.session || !locals.user || !locals.profile) throw redirect(303, '/login');

  const ehAdminOuDirigente = locals.profile.role === 'admin' || locals.profile.role === 'dirigente';
  if (ehAdminOuDirigente) return;

  const userId = locals.user.id;
  const ontem = hojeIsoBrasil(-1);

  const [dqRes, dqPartRes, partesRes] = await Promise.all([
    locals.supabase
      .from('designacao_quadras')
      .select('designacao_id, designacoes!inner(publicador_id, status)')
      .eq('quadra_id', quadraId)
      .eq('designacoes.publicador_id', userId)
      .eq('designacoes.status', 'aberta')
      .limit(1),
    // Mesma designação, mas EU sou participante (dupla/trio), não o líder.
    locals.supabase
      .from('designacao_quadras')
      .select('designacao_id, designacoes!inner(status, designacao_publicadores!inner(publicador_id))')
      .eq('quadra_id', quadraId)
      .eq('designacoes.status', 'aberta')
      .eq('designacoes.designacao_publicadores.publicador_id', userId)
      .limit(1),
    // Parte de arranjo ativa que me inclui (dirigente repartiu essa quadra
    // pra mim/minha dupla). Validade deriva da data do arranjo pai —
    // filtrada em JS logo abaixo (arranjoAindaVale), não dá pra expressar
    // "recorrente OR pontual não vencido" num único .or() do PostgREST.
    locals.supabase
      .from('arranjo_partes')
      .select('id, arranjos!inner(ativo, data, recorrente, data_fim)')
      .contains('publicadores', [userId])
      .contains('quadras_ids', [quadraId])
      .eq('arranjos.ativo', true)
  ]);
  const partesValidas = (partesRes.data ?? []).filter((p: any) => arranjoAindaVale(p.arranjos, ontem));

  // Só busca a 4ª cláusula (mais cara — 2 round trips) se nenhuma das
  // anteriores já resolveu.
  let ehColegaDeArranjo = false;
  if (!dqRes.data?.length && !dqPartRes.data?.length && !partesValidas.length) {
    const { data: arranjosDaQuadraRaw } = await locals.supabase
      .from('arranjos')
      .select('id, data, recorrente, data_fim')
      .eq('ativo', true)
      .contains('quadras_ids', [quadraId]);
    const arranjosDaQuadra = (arranjosDaQuadraRaw ?? []).filter((a) => arranjoAindaVale(a, ontem));
    if (arranjosDaQuadra.length > 0) {
      const { data: partesDoArranjo } = await locals.supabase
        .from('arranjo_partes')
        .select('id')
        .in('arranjo_id', arranjosDaQuadra.map((a) => a.id))
        .contains('publicadores', [userId])
        .limit(1);
      ehColegaDeArranjo = !!partesDoArranjo?.length;
    }
  }

  const pode = podeTrabalharQuadra({
    ehAdminOuDirigente,
    ehLiderDeDesignacaoAberta: !!dqRes.data?.length,
    ehParticipanteDeDesignacaoAberta: !!dqPartRes.data?.length,
    ehIncluidoEmParteDeArranjoAtiva: !!partesValidas.length,
    quadraEmArranjoAtivo: ehColegaDeArranjo
  });
  if (!pode) throw error(403, 'Você não tem essa quadra designada.');
}
