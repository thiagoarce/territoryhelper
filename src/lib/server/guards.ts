// Guards reutilizáveis pra rotas server-side. Use em +layout.server.ts
// das pastas /admin, /dirigente, /publicador.
import { redirect, error } from '@sveltejs/kit';
import type { Role } from '$lib/types';
import { podeTrabalharQuadra } from './posse';

export function exigirRole(locals: App.Locals, rolesPermitidas: Role[]) {
  if (!locals.session || !locals.profile) throw redirect(303, '/login');
  if (!locals.profile.ativo) throw redirect(303, '/login?msg=desativado');
  if (!rolesPermitidas.includes(locals.profile.role)) {
    throw error(403, 'Acesso negado pra essa área.');
  }
}

// Servo de publicações NÃO é role — é uma capacidade (profiles.servo_publicacoes)
// independente do role. Admin sempre passa. Rota /publicacoes fica FORA do
// namespace /admin/* (que é 100% admin-only via +layout.server.ts) justamente
// pra um servo publicador comum conseguir chegar nela.
export function exigirServoPub(locals: App.Locals) {
  if (!locals.session || !locals.profile) throw redirect(303, '/login');
  if (!locals.profile.ativo) throw redirect(303, '/login?msg=desativado');
  if (locals.profile.role !== 'admin' && !locals.profile.servo_publicacoes) {
    throw error(403, 'Acesso restrito ao servo de publicações.');
  }
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
  const hoje = new Date().toISOString().substring(0, 10);
  const ontem = new Date(Date.now() - 86400000).toISOString().substring(0, 10);

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
    // pra mim/minha dupla). Validade deriva da data do arranjo pai.
    locals.supabase
      .from('arranjo_partes')
      .select('id, arranjos!inner(ativo, data)')
      .contains('publicadores', [userId])
      .contains('quadras_ids', [quadraId])
      .eq('arranjos.ativo', true)
      .or(`data.gte.${ontem},data.is.null`, { foreignTable: 'arranjos' })
      .limit(1)
  ]);

  // Só busca a 4ª cláusula (mais cara — 2 round trips) se nenhuma das
  // anteriores já resolveu.
  let ehColegaDeArranjo = false;
  if (!dqRes.data?.length && !dqPartRes.data?.length && !partesRes.data?.length) {
    const { data: arranjosDaQuadra } = await locals.supabase
      .from('arranjos')
      .select('id')
      .eq('ativo', true)
      .contains('quadras_ids', [quadraId])
      .or(`data.gte.${ontem},data.is.null`)
      .or(`recorrente.eq.false,data_fim.is.null,data_fim.gte.${hoje}`);
    if (arranjosDaQuadra && arranjosDaQuadra.length > 0) {
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
    ehIncluidoEmParteDeArranjoAtiva: !!partesRes.data?.length,
    quadraEmArranjoAtivo: ehColegaDeArranjo
  });
  if (!pode) throw error(403, 'Você não tem essa quadra designada.');
}
