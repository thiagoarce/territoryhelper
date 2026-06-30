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
  const out: Ocorrencia<A>[] = [];
  for (const a of arranjos) {
    if (!a.ativo) continue;
    if (a.recorrente) {
      if (a.dia_semana === null || a.dia_semana === undefined) continue;
      if (a.data_inicio && a.data_inicio > sem.isoFim) continue;
      if (a.data_fim && a.data_fim < sem.isoIni) continue;
      const d = new Date(sem.ini);
      const diffDias = (a.dia_semana - 1 + 7) % 7;
      d.setDate(sem.ini.getDate() + diffDias);
      const dIso = d.toISOString().slice(0, 10);
      if (a.data_inicio && dIso < a.data_inicio) continue;
      if (a.data_fim && dIso > a.data_fim) continue;
      out.push({ arranjo: a, data: dIso, dia_semana: a.dia_semana });
    } else if (a.data && a.data >= sem.isoIni && a.data <= sem.isoFim) {
      const d = new Date(a.data + 'T12:00:00');
      out.push({ arranjo: a, data: a.data, dia_semana: d.getDay() });
    }
  }
  return out.sort((x, y) => {
    const dx = (x.dia_semana - 1 + 7) % 7;
    const dy = (y.dia_semana - 1 + 7) % 7;
    if (dx !== dy) return dx - dy;
    return (x.arranjo.hora_inicio ?? '') > (y.arranjo.hora_inicio ?? '') ? 1 : -1;
  });
}

export function agruparPorDia<A extends ArranjoBase>(ocs: Ocorrencia<A>[]): Record<number, Ocorrencia<A>[]> {
  const m: Record<number, Ocorrencia<A>[]> = {};
  for (const o of ocs) (m[o.dia_semana] ??= []).push(o);
  return m;
}
