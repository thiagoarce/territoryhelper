import type { PageServerLoad } from './$types';

export interface TpJanela {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

export interface TpPublicadorLinha {
  id: string;
  nome: string;
  transporta_carrinho: boolean;
  janelas: TpJanela[];
}

// Roster read-only: cadastrar disponibilidade é do próprio publicador em
// /perfil (TP-B, ainda não construído) — aqui o admin só CONSULTA pra
// montar a escala. As tabelas já existem (migration 042), só ficam vazias
// até o TP-B ganhar UI própria.
export const load: PageServerLoad = async ({ locals }) => {
  const [publicadoresRes, prefsRes, dispRes] = await Promise.all([
    locals.supabase.from('profiles').select('id, nome').eq('ativo', true).order('nome'),
    locals.supabase.from('tp_preferencias').select('publicador_id, transporta_carrinho'),
    locals.supabase
      .from('tp_disponibilidade')
      .select('publicador_id, dia_semana, hora_inicio, hora_fim')
      .order('dia_semana')
      .order('hora_inicio')
  ]);

  const transportaPorId: Record<string, boolean> = {};
  for (const p of (prefsRes.data ?? []) as any[]) transportaPorId[p.publicador_id] = p.transporta_carrinho;

  const janelasPorId: Record<string, TpJanela[]> = {};
  for (const d of (dispRes.data ?? []) as any[]) {
    (janelasPorId[d.publicador_id] ||= []).push({
      dia_semana: d.dia_semana,
      hora_inicio: d.hora_inicio,
      hora_fim: d.hora_fim
    });
  }

  const publicadores: TpPublicadorLinha[] = ((publicadoresRes.data ?? []) as any[]).map((p) => ({
    id: p.id,
    nome: p.nome,
    transporta_carrinho: transportaPorId[p.id] ?? false,
    janelas: janelasPorId[p.id] ?? []
  }));

  return { publicadores };
};
