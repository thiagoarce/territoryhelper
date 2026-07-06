import { hojeIsoBrasil } from '$lib/utils/data';

// Status da campanha é DERIVADO (não armazenado) — mesmo princípio das
// quadras (concluída/pendente vêm de data_conclusao, não de um enum).
export type StatusCampanha = 'planejada' | 'em_andamento' | 'encerrada';

export function statusCampanha(c: { ativa: boolean; data_inicio: string; data_alvo?: string }): StatusCampanha {
  if (!c.ativa) return 'encerrada';
  const hoje = hojeIsoBrasil();
  return hoje < c.data_inicio ? 'planejada' : 'em_andamento';
}
