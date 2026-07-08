// Tipos compartilhados de turno/disponibilidade do TP mensal. A função
// montarMes() que vivia aqui (T29/A22-f4 — preenchia turnos JÁ CRIADOS
// com gente, a partir da disponibilidade) foi substituída pelo fluxo
// inverso em $lib/tp-matching.ts::encontrarMatches (a disponibilidade
// decide quem e quando; o admin só escolhe carrinho+ponto depois) — ver
// CLAUDE.md. As interfaces continuam aqui porque `TurnoAlvo`/
// `ParticipanteExistente` ainda tipam os dados carregados em
// /admin/tp (turnos existentes do mês, usados pra excluir gente já
// escalada do novo algoritmo de match).

export interface TurnoAlvo {
  agendamento_id: number;
  data: string; // yyyy-mm-dd
  carrinho_id: number;
  ponto_id: number | null;
  ponto_avulso: string | null;
  hora_inicio: string;
  hora_fim: string;
}

export interface JanelaDisponibilidade {
  publicador_id: string;
  dia: string; // yyyy-mm-dd
  hora_inicio: string;
  hora_fim: string;
}

export interface PublicadorMontagem {
  id: string;
  transporta_carrinho: boolean;
}

export interface ParticipanteExistente {
  agendamento_id: number;
  data: string;
  publicador_id: string;
}
