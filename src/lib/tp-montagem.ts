// T29 (A22-f4): algoritmo de montagem automática do TP mensal —
// heurística gulosa e PURA (sem I/O). Recebe os dados já carregados do
// mês (turnos-alvo = ocorrências de tp_agendamentos já expandidas por
// ocorrenciasAgendamentoEntre, disponibilidade do mês, publicadores já
// filtrados por aprovados) e devolve uma PROPOSTA de designação — quem
// grava em tp_agendamento_participantes e notifica é a action do admin
// (o algoritmo não decide "publicar", só sugere).
//
// Regras (heurística, não é solver ótimo):
// (a) cada turno mira 2–3 pessoas; quando 2+ carrinhos compartilham o
//     mesmo ponto+horário (ex: carrinho + display), o grupo mira 3–5;
// (b) pelo menos 1 pessoa com transporta_carrinho por turno, quando
//     disponível;
// (c) balanceamento de carga: quem tem menos turnos no mês (contando
//     designações já existentes) entra primeiro;
// (d) nunca designa fora da disponibilidade marcada, nem duas vezes no
//     mesmo horário (mesmo em turnos diferentes do mesmo dia).

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

export interface DesignacaoProposta {
  agendamento_id: number;
  data: string;
  publicador_id: string;
  motivo: 'transporte' | 'preenchimento';
}

export interface TurnoResumo {
  agendamento_id: number;
  data: string;
  designados: number; // já existentes + propostos
  alvoMin: number;
  temTransporte: boolean;
}

export interface ResultadoMontagem {
  propostas: DesignacaoProposta[];
  resumoPorTurno: TurnoResumo[];
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function sobrepoe(aIni: string, aFim: string, bIni: string, bFim: string): boolean {
  return minutos(aIni) < minutos(bFim) && minutos(bIni) < minutos(aFim);
}

function chaveTurno(agendamentoId: number, data: string): string {
  return agendamentoId + '|' + data;
}

function chavePontoHorario(t: TurnoAlvo): string {
  const ponto = t.ponto_id != null ? 'p' + t.ponto_id : 'a' + (t.ponto_avulso ?? '');
  return t.data + '|' + ponto + '|' + t.hora_inicio + '|' + t.hora_fim;
}

export function montarMes(
  turnos: TurnoAlvo[],
  disponibilidades: JanelaDisponibilidade[],
  publicadores: PublicadorMontagem[],
  jaDesignados: ParticipanteExistente[]
): ResultadoMontagem {
  // Disponibilidade por publicador+dia (pode ter várias janelas no dia).
  const dispPorPubDia = new Map<string, JanelaDisponibilidade[]>();
  for (const d of disponibilidades) {
    const k = d.publicador_id + '|' + d.dia;
    const arr = dispPorPubDia.get(k);
    if (arr) arr.push(d);
    else dispPorPubDia.set(k, [d]);
  }
  function disponivel(pubId: string, data: string, ini: string, fim: string): boolean {
    const janelas = dispPorPubDia.get(pubId + '|' + data) ?? [];
    return janelas.some((j) => minutos(j.hora_inicio) <= minutos(ini) && minutos(j.hora_fim) >= minutos(fim));
  }

  // Grupos por ponto+horário — carrinhos diferentes no mesmo ponto/hora
  // formam uma "combinação" (mira 3–5 no total do grupo, não 2–3 cada).
  const gruposPorChave = new Map<string, TurnoAlvo[]>();
  for (const t of turnos) {
    const k = chavePontoHorario(t);
    const arr = gruposPorChave.get(k);
    if (arr) arr.push(t);
    else gruposPorChave.set(k, [t]);
  }

  const turnoPorChave = new Map<string, TurnoAlvo>();
  for (const t of turnos) turnoPorChave.set(chaveTurno(t.agendamento_id, t.data), t);

  // Designados por turno (já existentes) + carga total do mês por publicador.
  const designadosPorTurno = new Map<string, Set<string>>();
  const cargaPorPublicador = new Map<string, number>();
  for (const p of publicadores) cargaPorPublicador.set(p.id, 0);
  for (const p of jaDesignados) {
    const kt = chaveTurno(p.agendamento_id, p.data);
    const set = designadosPorTurno.get(kt);
    if (set) set.add(p.publicador_id);
    else designadosPorTurno.set(kt, new Set([p.publicador_id]));
    cargaPorPublicador.set(p.publicador_id, (cargaPorPublicador.get(p.publicador_id) ?? 0) + 1);
  }

  // Ocupação por publicador+dia (janelas já tomadas) — pra nunca sobrepor
  // dois turnos do mesmo dia na mesma pessoa. Pré-carrega com designações
  // já existentes de QUALQUER turno (não só os que estamos preenchendo agora).
  const ocupadoPorDia = new Map<string, { ini: string; fim: string }[]>();
  function marcarOcupado(pubId: string, data: string, ini: string, fim: string): void {
    const k = pubId + '|' + data;
    const arr = ocupadoPorDia.get(k);
    if (arr) arr.push({ ini, fim });
    else ocupadoPorDia.set(k, [{ ini, fim }]);
  }
  function estaLivre(pubId: string, data: string, ini: string, fim: string): boolean {
    const janelas = ocupadoPorDia.get(pubId + '|' + data) ?? [];
    return !janelas.some((j) => sobrepoe(j.ini, j.fim, ini, fim));
  }
  for (const p of jaDesignados) {
    const t = turnoPorChave.get(chaveTurno(p.agendamento_id, p.data));
    if (t) marcarOcupado(p.publicador_id, p.data, t.hora_inicio, t.hora_fim);
  }

  const transportaSet = new Set(publicadores.filter((p) => p.transporta_carrinho).map((p) => p.id));

  function candidatosElegiveis(t: TurnoAlvo, jaNesteTurno: Set<string>): PublicadorMontagem[] {
    return publicadores
      .filter((p) => !jaNesteTurno.has(p.id))
      .filter((p) => disponivel(p.id, t.data, t.hora_inicio, t.hora_fim))
      .filter((p) => estaLivre(p.id, t.data, t.hora_inicio, t.hora_fim))
      .sort((a, b) => {
        const ca = cargaPorPublicador.get(a.id) ?? 0;
        const cb = cargaPorPublicador.get(b.id) ?? 0;
        if (ca !== cb) return ca - cb;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  }

  const propostas: DesignacaoProposta[] = [];
  const resumoPorTurno: TurnoResumo[] = [];

  const turnosOrdenados = [...turnos].sort((a, b) =>
    a.data !== b.data
      ? a.data < b.data ? -1 : 1
      : a.hora_inicio !== b.hora_inicio
        ? (a.hora_inicio < b.hora_inicio ? -1 : 1)
        : a.agendamento_id - b.agendamento_id
  );

  for (const t of turnosOrdenados) {
    const kt = chaveTurno(t.agendamento_id, t.data);
    const grupo = gruposPorChave.get(chavePontoHorario(t)) ?? [t];
    const emGrupo = grupo.length > 1;
    const alvoMin = emGrupo ? 3 : 2;
    const alvoMax = emGrupo ? 5 : 3;

    const jaNesteTurno = new Set(designadosPorTurno.get(kt) ?? []);
    let temTransporte = [...jaNesteTurno].some((id) => transportaSet.has(id));

    // (b) garante 1 transportador primeiro, se faltar e existir candidato.
    if (!temTransporte && jaNesteTurno.size < alvoMax) {
      const candidatos = candidatosElegiveis(t, jaNesteTurno).filter((p) => transportaSet.has(p.id));
      const escolhido = candidatos[0];
      if (escolhido) {
        propostas.push({ agendamento_id: t.agendamento_id, data: t.data, publicador_id: escolhido.id, motivo: 'transporte' });
        jaNesteTurno.add(escolhido.id);
        cargaPorPublicador.set(escolhido.id, (cargaPorPublicador.get(escolhido.id) ?? 0) + 1);
        marcarOcupado(escolhido.id, t.data, t.hora_inicio, t.hora_fim);
        temTransporte = true;
      }
    }

    // (a)+(c) completa até o alvo máximo com quem tem menos carga.
    while (jaNesteTurno.size < alvoMax) {
      const candidatos = candidatosElegiveis(t, jaNesteTurno);
      const escolhido = candidatos[0];
      if (!escolhido) break; // sem mais gente disponível — segue com o que deu
      propostas.push({ agendamento_id: t.agendamento_id, data: t.data, publicador_id: escolhido.id, motivo: 'preenchimento' });
      jaNesteTurno.add(escolhido.id);
      cargaPorPublicador.set(escolhido.id, (cargaPorPublicador.get(escolhido.id) ?? 0) + 1);
      marcarOcupado(escolhido.id, t.data, t.hora_inicio, t.hora_fim);
    }

    resumoPorTurno.push({
      agendamento_id: t.agendamento_id,
      data: t.data,
      designados: jaNesteTurno.size,
      alvoMin,
      temTransporte
    });
  }

  return { propostas, resumoPorTurno };
}
