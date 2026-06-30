// Helpers de cálculo de ocorrências de arranjos.
// Compartilhado entre /admin/arranjos, /dirigente/arranjo e /publicador/arranjo.

export interface ArranjoBase {
  id: number;
  modalidade_id: number;
  nome: string | null;
  recorrente: boolean;
  dia_semana: number | null;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  local_endereco: string | null;
  dirigente_id: string | null;
  quadras_ids: string[] | null;
  cartas_locais_ids: number[] | null;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  notas: string | null;
  ativo: boolean;
  data_inicio: string | null;
  data_fim: string | null;
}

export interface Ocorrencia<A extends ArranjoBase = ArranjoBase> {
  arranjo: A;
  data: string;
  dia_semana: number;
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DIAS_ORDENADOS = [1, 2, 3, 4, 5, 6, 0]; // seg→dom

export function semanaAtual() {
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  const diaSem = hoje.getDay();
  const diffSegunda = diaSem === 0 ? -6 : 1 - diaSem;
  const ini = new Date(hoje);
  ini.setDate(hoje.getDate() + diffSegunda);
  const fim = new Date(ini);
  fim.setDate(ini.getDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { ini, fim, isoIni: iso(ini), isoFim: iso(fim) };
}

export function ocorrenciasDaSemana<A extends ArranjoBase>(arranjos: A[]): Ocorrencia<A>[] {
  const sem = semanaAtual();
  return ocorrenciasEntre(arranjos, sem.isoIni, sem.isoFim);
}

// Expande ocorrências entre dataIni e dataFim (ISO yyyy-mm-dd, inclusive).
// Recorrentes geram 1 ocorrência por semana no dia_semana dentro do range.
// Pontuais entram se a data cair no range.
export function ocorrenciasEntre<A extends ArranjoBase>(
  arranjos: A[],
  isoIni: string,
  isoFim: string
): Ocorrencia<A>[] {
  const out: Ocorrencia<A>[] = [];
  const ini = new Date(isoIni + 'T12:00:00');
  const fim = new Date(isoFim + 'T12:00:00');

  for (const a of arranjos) {
    if (!a.ativo) continue;
    if (a.recorrente) {
      if (a.dia_semana === null || a.dia_semana === undefined) continue;
      if (a.data_inicio && a.data_inicio > isoFim) continue;
      if (a.data_fim && a.data_fim < isoIni) continue;
      // Acha primeiro dia da semana >= ini com o dia_semana certo
      const d = new Date(ini);
      while (d.getDay() !== a.dia_semana && d <= fim) {
        d.setDate(d.getDate() + 1);
      }
      while (d <= fim) {
        const dIso = d.toISOString().slice(0, 10);
        if ((!a.data_inicio || dIso >= a.data_inicio) && (!a.data_fim || dIso <= a.data_fim)) {
          out.push({ arranjo: a, data: dIso, dia_semana: a.dia_semana });
        }
        d.setDate(d.getDate() + 7);
      }
    } else if (a.data && a.data >= isoIni && a.data <= isoFim) {
      const d = new Date(a.data + 'T12:00:00');
      out.push({ arranjo: a, data: a.data, dia_semana: d.getDay() });
    }
  }
  return out.sort((x, y) => {
    if (x.data !== y.data) return x.data < y.data ? -1 : 1;
    return (x.arranjo.hora_inicio ?? '') > (y.arranjo.hora_inicio ?? '') ? 1 : -1;
  });
}

export function agruparPorDia<A extends ArranjoBase>(ocs: Ocorrencia<A>[]): Record<number, Ocorrencia<A>[]> {
  const m: Record<number, Ocorrencia<A>[]> = {};
  for (const o of ocs) (m[o.dia_semana] ??= []).push(o);
  return m;
}

// Agrupa ocorrências por chave de dia (yyyy-mm-dd) pra view de mês/ano.
export function agruparPorData<A extends ArranjoBase>(ocs: Ocorrencia<A>[]): Record<string, Ocorrencia<A>[]> {
  const m: Record<string, Ocorrencia<A>[]> = {};
  for (const o of ocs) (m[o.data] ??= []).push(o);
  return m;
}

export type Periodo = 'semana' | 'mes' | 'tres_meses' | 'ano';

export function rangeDoPeriodo(p: Periodo): { isoIni: string; isoFim: string; label: string } {
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'semana') {
    const s = semanaAtual();
    return { isoIni: s.isoIni, isoFim: s.isoFim, label: 'Esta semana' };
  }
  if (p === 'mes') {
    // Mês corrente: dia 1 → último dia
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 12, 0, 0);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 12, 0, 0);
    return { isoIni: iso(ini), isoFim: iso(fim), label: 'Este mês' };
  }
  if (p === 'tres_meses') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 12, 0, 0);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 3, 0, 12, 0, 0);
    return { isoIni: iso(ini), isoFim: iso(fim), label: 'Próximos 3 meses' };
  }
  // ano
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 12, 0, 0);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 12, 0, 12, 0, 0);
  return { isoIni: iso(ini), isoFim: iso(fim), label: 'Próximo ano' };
}
