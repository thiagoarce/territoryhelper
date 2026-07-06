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

// "Hoje" (yyyy-mm-dd) no fuso LOCAL do relógio. No browser (usuário no
// Brasil) é o dia certo; `toISOString()` seria UTC e vira AMANHÃ depois
// das 21h de Brasília — bug real: label "hoje" errado e botão de
// relatório de turno aparecendo antes da hora.
export function hojeIsoLocal(offsetDias = 0): string {
  const d = new Date(Date.now() + offsetDias * 86400000);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// "Hoje" (yyyy-mm-dd) no fuso do BRASIL (UTC-3), pra código de SERVIDOR —
// Cloudflare roda em UTC, então `toISOString()` puro registra o dia
// SEGUINTE entre 21h e meia-noite de Brasília (conclusão de quadra caía
// no dia errado). No browser use hojeIsoLocal.
export function hojeIsoBrasil(offsetDias = 0): string {
  return new Date(Date.now() - 3 * 3600000 + offsetDias * 86400000).toISOString().substring(0, 10);
}
