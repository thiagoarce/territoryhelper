// Dias corridos entre uma data `yyyy-mm-dd` e hoje, por CALENDÁRIO (não por
// horas). Usar meia-noite local nos dois lados — nunca `Date.now()` menos um
// timestamp ancorado ao meio-dia, que dá -1 sempre que o relógio local ainda
// não passou do meio-dia (bug real: quadra concluída HOJE aparecia "há -1 dias").
export function diasDesde(dataIso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataIso + 'T00:00:00');
  return Math.round((hoje.getTime() - alvo.getTime()) / 86400000);
}
