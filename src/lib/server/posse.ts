// Helper único de posse de quadra — a decisão "esse publicador pode
// trabalhar essa quadra?" existia duplicada em dois lugares que podiam
// divergir: a função SQL `pode_editar_local` (RLS, migrations 026/029/
// 030/031/038) e o guard `exigirQuadraDesignada` (defesa em profundidade
// na rota). Consolidamos a lógica de decisão aqui, numa função pura e
// testável — o guard só junta os booleans (via queries) e chama isso.
//
// Mantenha os comentários de cada cláusula alinhados com a cláusula
// correspondente de `pode_editar_local` na migration mais recente
// (hoje: 038_designacao_multi_publicador.sql) — são as MESMAS regras,
// uma em SQL (RLS) e outra aqui (guard), de propósito redundantes.

export interface PosseQuadraInput {
  /** admin/dirigente sempre podem — bypass total */
  ehAdminOuDirigente: boolean;
  /** designação pessoal aberta cobrindo a quadra, com esse publicador como LÍDER */
  ehLiderDeDesignacaoAberta: boolean;
  /** mesma designação, mas esse publicador é PARTICIPANTE (dupla/trio) */
  ehParticipanteDeDesignacaoAberta: boolean;
  /** parte de arranjo ativa (data null-tolerante) que inclui esse publicador e essa quadra */
  ehIncluidoEmParteDeArranjoAtiva: boolean;
  /** a quadra está dentro do território de QUALQUER arranjo ativo (saída de grupo) */
  quadraEmArranjoAtivo: boolean;
}

export function podeTrabalharQuadra(input: PosseQuadraInput): boolean {
  return (
    input.ehAdminOuDirigente ||
    input.ehLiderDeDesignacaoAberta ||
    input.ehParticipanteDeDesignacaoAberta ||
    input.ehIncluidoEmParteDeArranjoAtiva ||
    input.quadraEmArranjoAtivo
  );
}
