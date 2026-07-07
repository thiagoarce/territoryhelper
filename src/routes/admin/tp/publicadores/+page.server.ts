import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { exigirAdmin } from '../_shared';

export interface TpJanela {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

export interface TpPublicadorLinha {
  id: string;
  nome: string;
  tp_aprovado: boolean;
  transporta_carrinho: boolean;
  janelas: TpJanela[];
}

// Roster: cadastrar disponibilidade é do próprio publicador em /perfil
// (TP-B) — aqui o admin CONSULTA pra montar a escala e (T31) APROVA quem
// pode aparecer nas listas de designação/montagem/reserva do TP.
export const load: PageServerLoad = async ({ locals }) => {
  const [publicadoresRes, prefsRes, dispRes] = await Promise.all([
    locals.supabase.from('profiles').select('id, nome, tp_aprovado').eq('ativo', true).order('nome'),
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
    tp_aprovado: p.tp_aprovado ?? false,
    transporta_carrinho: transportaPorId[p.id] ?? false,
    janelas: janelasPorId[p.id] ?? []
  }));

  return { publicadores };
};

export const actions: Actions = {
  alternarAprovacao: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const aprovado = fd.get('aprovado') === 'true';
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('profiles').update({ tp_aprovado: aprovado }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: aprovado ? 'Aprovado pro TP' : 'Aprovação removida' };
  }
};
