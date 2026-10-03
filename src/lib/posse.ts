// Helper único de posse de quadra — a decisão "esse publicador pode
// trabalhar essa quadra?" existia duplicada em dois lugares que podiam
// divergir: a função SQL `pode_editar_local` (RLS, migrations 026/029/
// 030/031/038) e o guard `exigirQuadraDesignada` (defesa em profundidade
// na rota). Consolidamos a lógica de decisão aqui, numa função pura e
// testável — o guard só junta os booleans (via queries) e chama isso.
//
// Mantenha os comentários de cada cláusula alinhados com a cláusula
// correspondente de `pode_editar_local` na migration mais recente
// (hoje: 040_fix_posse_seguranca.sql) — são as MESMAS regras, uma em SQL
// (RLS) e outra aqui (guard), de propósito redundantes.

export interface PosseQuadraInput {
  /** admin/dirigente sempre podem — bypass total */
  ehAdminOuDirigente: boolean;
  /** designação pessoal aberta cobrindo a quadra, com esse publicador como LÍDER */
  ehLiderDeDesignacaoAberta: boolean;
  /** mesma designação, mas esse publicador é PARTICIPANTE (dupla/trio) */
  ehParticipanteDeDesignacaoAberta: boolean;
  /** parte de arranjo ativa (data null-tolerante) que inclui esse publicador e essa quadra */
  ehIncluidoEmParteDeArranjoAtiva: boolean;
  /**
   * A quadra está no território de um arranjo ativo E esse publicador tem
   * uma parte NESSE MESMO arranjo (em qualquer quadra dele, não precisa
   * ser a mesma) — saída de grupo, quem tem parte ajuda em qualquer
   * quadra da saída. NÃO é "qualquer publicador do sistema" — precisa ter
   * vínculo real com o arranjo via alguma parte seguindo migration 040.
   */
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

export interface ConclusaoQuadraInput {
  ehAdminOuDirigente: boolean;
  ehLiderDeDesignacaoPessoalAtiva: boolean;
  ehParticipanteDeDesignacaoPessoalAtiva: boolean;
}

/** Conclusão é global para dirigente/admin e contextual para território pessoal. */
export function podeConcluirQuadra(input: ConclusaoQuadraInput): boolean {
  return (
    input.ehAdminOuDirigente
    || input.ehLiderDeDesignacaoPessoalAtiva
    || input.ehParticipanteDeDesignacaoPessoalAtiva
  );
}
