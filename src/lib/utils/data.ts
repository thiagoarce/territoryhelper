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

// Dia da semana (0=domingo..6=sábado) de uma data `yyyy-mm-dd`. Soma
// T12:00:00 pelo mesmo motivo de sempre: parse direto de "yyyy-mm-dd"
// vira UTC meia-noite, que em UTC-3 pode cair no dia anterior — meio-dia
// nunca cruza a fronteira. Mesmo padrão já usado em tp-matching.ts e
// arranjos.ts.
export function diaDaSemana(dataIso: string): number {
  return new Date(dataIso + 'T12:00:00').getDay();
}

export function ehFimDeSemana(dataIso: string): boolean {
  const d = diaDaSemana(dataIso);
  return d === 0 || d === 6;
}

// Combina uma data (yyyy-mm-dd) + hora LOCAL do Brasil (HH:MM) num
// timestamp UTC (ISO) — pro publicador informar "concluí às 15h" e isso
// virar um timestamptz correto (marcado_em), sem depender de fuso do
// Postgres. Offset fixo -03:00 (Brasil não observa horário de verão
// desde 2019) direto na string, formato que o Date entende sem
// ambiguidade de fuso local do processo que roda o código.
export function horaBrasilParaIso(dataIso: string, horaHHMM: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(horaHHMM)) return null;
  const d = new Date(`${dataIso}T${horaHHMM}:00-03:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
