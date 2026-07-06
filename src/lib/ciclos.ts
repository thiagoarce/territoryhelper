// Lógica pura de CICLO de trabalho — decide se uma marca antiga ainda
// "vale" (botão pressionado) ou pertence a um ciclo já fechado (botão
// solto, histórico preservado). Compartilhada entre server e client.

// Casa em casa: o ciclo da quadra fecha quando ela é concluída
// (`quadras.data_conclusao`). Desfecho registrado ATÉ o dia da conclusão
// (inclusive) fez parte do ciclo que fechou; só registro POSTERIOR conta
// no ciclo atual. Sem conclusão registrada, tudo conta.
export function desfechoNoCicloAtual(
  registroTs: string | null | undefined,
  dataConclusaoQuadra: string | null | undefined
): boolean {
  if (!registroTs) return false;
  if (!dataConclusaoQuadra) return true;
  return registroTs.substring(0, 10) > dataConclusaoQuadra;
}

// Cartas: ciclo global iniciado manualmente pelo admin (tabela
// cartas_ciclos). Marca de "carta escrita" anterior ao início do ciclo
// atual não vale mais. Sem ciclo iniciado, toda marca vale.
export function cartaEscritaNoCiclo(
  cartaEntregue: string | null | undefined,
  cicloInicio: string | null | undefined
): boolean {
  if (!cartaEntregue) return false;
  if (!cicloInicio) return true;
  return cartaEntregue >= cicloInicio;
}
