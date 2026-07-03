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

// Confere se o usuário logado tem posse da quadra. Admin/dirigente passam.
// Publicador passa se: designação aberta com a quadra, OU delegação temp
// ativa cobrindo ela, OU a quadra está num arranjo ativo (saída de grupo —
// o dirigente pode mandar trabalhar qualquer quadra do arranjo na hora).
// Defesa em profundidade além do RLS (que usa pode_editar_local).
export async function exigirQuadraDesignada(locals: App.Locals, quadraId: string): Promise<void> {
  if (!locals.session || !locals.user || !locals.profile) throw redirect(303, '/login');

  const ehAdminOuDirigente = locals.profile.role === 'admin' || locals.profile.role === 'dirigente';
  if (ehAdminOuDirigente) return;

  const userId = locals.user.id;
  const ontem = new Date(Date.now() - 86400000).toISOString().substring(0, 10);

  const [dqRes, dqPartRes, partesRes, arrRes] = await Promise.all([
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
      .limit(1),
    // Quadra dentro de um arranjo ativo — os chips de /publicador/arranjo
    // linkam pra cá pra qualquer publicador da saída.
    locals.supabase
      .from('arranjos')
      .select('id')
      .eq('ativo', true)
      .contains('quadras_ids', [quadraId])
      .limit(1)
  ]);

  const pode = podeTrabalharQuadra({
    ehAdminOuDirigente,
    ehLiderDeDesignacaoAberta: !!dqRes.data?.length,
    ehParticipanteDeDesignacaoAberta: !!dqPartRes.data?.length,
    ehIncluidoEmParteDeArranjoAtiva: !!partesRes.data?.length,
    quadraEmArranjoAtivo: !!arrRes.data?.length
  });
  if (!pode) throw error(403, 'Você não tem essa quadra designada.');
}
