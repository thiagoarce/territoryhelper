// Expansão de recorrência + detecção de conflito pra Testemunho Público
// (TP-F, migration 043). Análogo a `ocorrenciasEntre` de arranjos.ts, mas
// não reaproveitado dela: recorrência mais rica (diária/quinzenal/mensal)
// + exceções por ocorrência (cancelar/sobrescrever só um dia da série).

export type Recorrencia = 'nenhuma' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal';

export interface AgendamentoBase {
  id: number;
  carrinho_id: number;
  ponto_id: number | null;
  ponto_avulso: string | null;
  data: string; // yyyy-mm-dd — primeira/única ocorrência
  hora_inicio: string;
  hora_fim: string;
  recorrencia: Recorrencia;
  recorrencia_fim: string | null;
  ativo: boolean;
  notas: string | null;
  // T28: quem criou e como (admin monta a escala x publicador reserva
  // sobra) — opcionais porque a expansão de ocorrências não usa isso.
  origem?: 'admin' | 'reserva';
  criado_por?: string | null;
}

export interface ExcecaoBase {
  agendamento_id: number;
  data: string;
  cancelada: boolean;
  hora_inicio: string | null;
  hora_fim: string | null;
  carrinho_id: number | null;
  ponto_id: number | null;
  ponto_avulso: string | null;
  notas: string | null;
}

export interface OcorrenciaAgendamento {
  agendamento_id: number;
  data: string;
  carrinho_id: number;
  ponto_id: number | null;
  ponto_avulso: string | null;
  hora_inicio: string;
  hora_fim: string;
  notas: string | null;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(s: string): Date {
  return new Date(s + 'T12:00:00');
}

function parseIsoParts(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Último dia do mês `m` (1-based) do ano `y`.
function diasNoMes(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function expandirPeriodico(a: AgendamentoBase, passoDias: number, isoIni: string, isoFim: string): string[] {
  const datas: string[] = [];
  const fimRange = parseIsoDate(isoFim);
  const fimSerie = a.recorrencia_fim ? parseIsoDate(a.recorrencia_fim) : null;
  const limite = fimSerie && fimSerie < fimRange ? fimSerie : fimRange;
  let d = parseIsoDate(a.data);
  while (d <= limite) {
    const dIso = iso(d);
    if (dIso >= isoIni) datas.push(dIso);
    const prox = new Date(d);
    prox.setDate(prox.getDate() + passoDias);
    d = prox;
  }
  return datas;
}

// Recorrência mensal = mesmo dia do mês. Meses sem esse dia (ex: dia 31 em
// abril) NÃO rolam pro próximo dia válido — a ocorrência daquele mês some
// (documentar isso na UI de criar agendamento).
function expandirMensal(a: AgendamentoBase, isoIni: string, isoFim: string): string[] {
  const base = parseIsoParts(a.data);
  const fimRange = parseIsoParts(isoFim);
  const ymNum = (y: number, m: number) => y * 12 + (m - 1);
  let limiteYm = ymNum(fimRange.y, fimRange.m);
  if (a.recorrencia_fim) {
    const fs = parseIsoParts(a.recorrencia_fim);
    limiteYm = Math.min(limiteYm, ymNum(fs.y, fs.m));
  }
  const datas: string[] = [];
  for (let ym = ymNum(base.y, base.m); ym <= limiteYm; ym++) {
    const y = Math.floor(ym / 12);
    const m = (((ym % 12) + 12) % 12) + 1;
    if (base.d > diasNoMes(y, m)) continue; // pula mês sem esse dia
    const candIso = toIso(y, m, base.d);
    if (candIso < a.data) continue;
    if (a.recorrencia_fim && candIso > a.recorrencia_fim) continue;
    if (candIso >= isoIni && candIso <= isoFim) datas.push(candIso);
  }
  return datas;
}

// Expande agendamentos ativos entre isoIni e isoFim (inclusive), aplicando
// exceções (cancelar ou sobrescrever campos) por ocorrência concreta.
export function ocorrenciasAgendamentoEntre(
  agendamentos: AgendamentoBase[],
  excecoes: ExcecaoBase[],
  isoIni: string,
  isoFim: string
): OcorrenciaAgendamento[] {
  const excMap = new Map<string, ExcecaoBase>();
  for (const e of excecoes) excMap.set(e.agendamento_id + '|' + e.data, e);

  const out: OcorrenciaAgendamento[] = [];
  for (const a of agendamentos) {
    if (!a.ativo) continue;
    let datas: string[];
    switch (a.recorrencia) {
      case 'nenhuma':
        datas = a.data >= isoIni && a.data <= isoFim ? [a.data] : [];
        break;
      case 'diaria':
        datas = expandirPeriodico(a, 1, isoIni, isoFim);
        break;
      case 'semanal':
        datas = expandirPeriodico(a, 7, isoIni, isoFim);
        break;
      case 'quinzenal':
        datas = expandirPeriodico(a, 14, isoIni, isoFim);
        break;
      default:
        datas = expandirMensal(a, isoIni, isoFim);
    }
    for (const d of datas) {
      const exc = excMap.get(a.id + '|' + d);
      if (exc?.cancelada) continue;
      const pontoSobrescrito = !!exc && (exc.ponto_id !== null || exc.ponto_avulso !== null);
      out.push({
        agendamento_id: a.id,
        data: d,
        carrinho_id: exc?.carrinho_id ?? a.carrinho_id,
        ponto_id: pontoSobrescrito ? exc!.ponto_id : a.ponto_id,
        ponto_avulso: pontoSobrescrito ? exc!.ponto_avulso : a.ponto_avulso,
        hora_inicio: exc?.hora_inicio ?? a.hora_inicio,
        hora_fim: exc?.hora_fim ?? a.hora_fim,
        notas: exc?.notas ?? a.notas
      });
    }
  }
  return out.sort((x, y) => {
    if (x.data !== y.data) return x.data < y.data ? -1 : 1;
    return x.hora_inicio < y.hora_inicio ? -1 : x.hora_inicio > y.hora_inicio ? 1 : 0;
  });
}

export function agruparOcorrenciasPorData(
  ocs: OcorrenciaAgendamento[]
): Record<string, OcorrenciaAgendamento[]> {
  const m: Record<string, OcorrenciaAgendamento[]> = {};
  for (const o of ocs) (m[o.data] ??= []).push(o);
  return m;
}

// Mesmo carrinho não pode estar em dois lugares com horário sobreposto no
// mesmo dia. Roda na action (server) — precisa expandir recorrência +
// aplicar exceções pra achar a ocorrência real do dia; não dá pra expressar
// como constraint de banco. `ignorarAgendamentoId` exclui o próprio
// agendamento sendo editado da checagem.
export function ocorrenciaConflitante(
  agendamentos: AgendamentoBase[],
  excecoes: ExcecaoBase[],
  carrinhoId: number,
  data: string,
  horaInicio: string,
  horaFim: string,
  ignorarAgendamentoId?: number
): OcorrenciaAgendamento | null {
  const ocorrenciasDoDia = ocorrenciasAgendamentoEntre(agendamentos, excecoes, data, data).filter(
    (o) => o.carrinho_id === carrinhoId && o.agendamento_id !== ignorarAgendamentoId
  );
  for (const o of ocorrenciasDoDia) {
    if (horaInicio < o.hora_fim && o.hora_inicio < horaFim) return o;
  }
  return null;
}
