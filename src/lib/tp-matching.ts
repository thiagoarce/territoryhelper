// TP: montagem por MATCH de disponibilidade — inverte o fluxo antigo
// (tp-montagem.ts: turno já existe → preenche gente) pra: gente com
// horário sobreposto → sugere o turno, admin só escolhe carrinho+local.
// Pura, sem I/O — a action do admin busca os dados e chama isto.
//
// Regras (confirmadas com o usuário):
// (a) corta o dia em blocos de duração fixa (padrão 2h) dentro de uma
//     janela de serviço (padrão 08:00–20:00) — sobreposições longas
//     viram vários blocos candidatos, não um turno gigante;
// (b) quem cobre o bloco inteiro (e não está ocupado por outro turno
//     já existente nesse horário) é candidato daquele bloco;
// (c) os candidatos de um bloco são particionados em grupos de 2
//     (par) — 1 grupo de 3 (trio) só quando sobra ímpar — cada grupo
//     é um turno À PARTE, em local separado (nunca uma junta gigante);
// (d) mesmo (dia da semana + horário) que se repete em 2+ semanas do
//     mês vira UMA proposta recorrente; a composição de cada grupo
//     (quem exatamente) pode variar semana a semana (3ª pessoa some/
//     aparece) — o slot (dia/horário) é o que se repete, não o par.

export interface JanelaDisponibilidade {
  publicador_id: string;
  dia: string; // yyyy-mm-dd
  hora_inicio: string;
  hora_fim: string;
}

// Ocupação já comprometida em outro turno (manual ou reserva) — pra não
// dar match em quem já está escalado nesse horário.
export interface OcupacaoExistente {
  publicador_id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
}

export interface ParametrosMatching {
  blocoDuracaoMin?: number; // default 120 (2h)
  horaInicioDia?: string; // default '08:00'
  horaFimDia?: string; // default '20:00'
}

export interface OcorrenciaProposta {
  data: string;
  publicadores: string[];
}

export interface PropostaTurno {
  id: string; // estável — usado pra "aceitar"/escolher carrinho+ponto
  dia_semana: number; // 0=domingo .. 6=sábado
  hora_inicio: string;
  hora_fim: string;
  recorrente: boolean;
  ocorrencias: OcorrenciaProposta[]; // 1 se não recorrente, 2+ se recorrente
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function sobrepoe(aIni: string, aFim: string, bIni: string, bFim: string): boolean {
  return minutos(aIni) < minutos(bFim) && minutos(bIni) < minutos(aFim);
}

function diaDaSemana(dataIso: string): number {
  return new Date(dataIso + 'T12:00:00').getDay();
}

function gerarBlocosDoDia(horaInicioDia: string, horaFimDia: string, blocoMin: number): { ini: string; fim: string }[] {
  const blocos: { ini: string; fim: string }[] = [];
  let atual = minutos(horaInicioDia);
  const fim = minutos(horaFimDia);
  while (atual + blocoMin <= fim) {
    blocos.push({ ini: fmt(atual), fim: fmt(atual + blocoMin) });
    atual += blocoMin;
  }
  return blocos;
}

function cobreBloco(janelas: { hora_inicio: string; hora_fim: string }[], blocoIni: string, blocoFim: string): boolean {
  return janelas.some((j) => minutos(j.hora_inicio) <= minutos(blocoIni) && minutos(j.hora_fim) >= minutos(blocoFim));
}

// (c) — pares, com 1 trio no final se sobrar ímpar. Nunca um grupo de 1.
function particionarGrupos(idsOrdenados: string[]): string[][] {
  const n = idsOrdenados.length;
  if (n < 2) return [];
  const grupos: string[][] = [];
  let i = 0;
  if (n % 2 === 0) {
    while (i < n) {
      grupos.push(idsOrdenados.slice(i, i + 2));
      i += 2;
    }
  } else {
    while (n - i > 3) {
      grupos.push(idsOrdenados.slice(i, i + 2));
      i += 2;
    }
    grupos.push(idsOrdenados.slice(i, i + 3));
  }
  return grupos;
}

interface BlocoDia {
  data: string;
  diaSemana: number;
  blocoIni: string;
  blocoFim: string;
  grupos: string[][];
}

export function encontrarMatches(
  disponibilidades: JanelaDisponibilidade[],
  ocupados: OcupacaoExistente[] = [],
  params: ParametrosMatching = {}
): PropostaTurno[] {
  const blocoMin = params.blocoDuracaoMin ?? 120;
  const horaInicioDia = params.horaInicioDia ?? '08:00';
  const horaFimDia = params.horaFimDia ?? '20:00';
  const blocosDoDia = gerarBlocosDoDia(horaInicioDia, horaFimDia, blocoMin);

  const dispPorPubDia = new Map<string, { hora_inicio: string; hora_fim: string }[]>();
  const publicadoresPorDia = new Map<string, Set<string>>();
  for (const d of disponibilidades) {
    const k = d.publicador_id + '|' + d.dia;
    const arr = dispPorPubDia.get(k);
    if (arr) arr.push(d); else dispPorPubDia.set(k, [d]);
    if (!publicadoresPorDia.has(d.dia)) publicadoresPorDia.set(d.dia, new Set());
    publicadoresPorDia.get(d.dia)!.add(d.publicador_id);
  }

  const ocupPorPubDia = new Map<string, { ini: string; fim: string }[]>();
  for (const o of ocupados) {
    const k = o.publicador_id + '|' + o.data;
    const arr = ocupPorPubDia.get(k);
    if (arr) arr.push({ ini: o.hora_inicio, fim: o.hora_fim });
    else ocupPorPubDia.set(k, [{ ini: o.hora_inicio, fim: o.hora_fim }]);
  }
  function estaLivre(pubId: string, dia: string, ini: string, fim: string): boolean {
    const arr = ocupPorPubDia.get(pubId + '|' + dia) ?? [];
    return !arr.some((o) => sobrepoe(o.ini, o.fim, ini, fim));
  }

  const diasComDisponibilidade = [...publicadoresPorDia.keys()].sort();

  const blocosPorDia: BlocoDia[] = [];
  for (const dia of diasComDisponibilidade) {
    const candidatos = [...(publicadoresPorDia.get(dia) ?? [])];
    for (const bloco of blocosDoDia) {
      const disponiveis = candidatos
        .filter((pubId) => {
          const janelas = dispPorPubDia.get(pubId + '|' + dia) ?? [];
          if (!cobreBloco(janelas, bloco.ini, bloco.fim)) return false;
          return estaLivre(pubId, dia, bloco.ini, bloco.fim);
        })
        .sort();
      const grupos = particionarGrupos(disponiveis);
      if (grupos.length > 0) {
        blocosPorDia.push({ data: dia, diaSemana: diaDaSemana(dia), blocoIni: bloco.ini, blocoFim: bloco.fim, grupos });
      }
    }
  }

  // (d) agrupa por (dia da semana, horário) pra detectar recorrência —
  // alinha os grupos de cada semana por índice (maior grupo primeiro,
  // desempate por composição) já que QUEM está no grupo pode variar.
  const porSlot = new Map<string, BlocoDia[]>();
  for (const b of blocosPorDia) {
    const k = `${b.diaSemana}|${b.blocoIni}|${b.blocoFim}`;
    const arr = porSlot.get(k);
    if (arr) arr.push(b); else porSlot.set(k, [b]);
  }

  const propostas: PropostaTurno[] = [];
  for (const [slotKey, semanas] of porSlot) {
    semanas.sort((a, b) => (a.data < b.data ? -1 : 1));
    const gruposOrdenadosPorSemana = semanas.map((s) =>
      [...s.grupos].sort((g1, g2) => g2.length - g1.length || g1.join(',').localeCompare(g2.join(',')))
    );
    const maxIndices = Math.max(...gruposOrdenadosPorSemana.map((g) => g.length));
    const [diaSemanaStr, ini, fim] = slotKey.split('|');

    for (let idx = 0; idx < maxIndices; idx++) {
      const ocorrencias: OcorrenciaProposta[] = [];
      for (let w = 0; w < semanas.length; w++) {
        const grupo = gruposOrdenadosPorSemana[w][idx];
        if (grupo) ocorrencias.push({ data: semanas[w].data, publicadores: grupo });
      }
      if (ocorrencias.length === 0) continue;
      propostas.push({
        id: `${slotKey}#${idx}`,
        dia_semana: Number(diaSemanaStr),
        hora_inicio: ini,
        hora_fim: fim,
        recorrente: ocorrencias.length > 1,
        ocorrencias
      });
    }
  }

  propostas.sort((a, b) =>
    a.dia_semana !== b.dia_semana ? a.dia_semana - b.dia_semana
      : a.hora_inicio !== b.hora_inicio ? a.hora_inicio.localeCompare(b.hora_inicio)
        : a.id.localeCompare(b.id)
  );
  return propostas;
}
