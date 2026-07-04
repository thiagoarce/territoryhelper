// Helpers compartilhados pelas 5 rotas de /admin/tp/* (Planner, Visão
// geral, Pontos, Equipamentos, Publicadores). Prefixo `_` exclui do
// roteamento do SvelteKit — é só um módulo importável.
import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgendamentoBase, ExcecaoBase } from '$lib/tp-agendamentos';

export function exigirAdmin(locals: App.Locals) {
  if (!locals.user) return fail(401, { erro: 'Não autenticado' });
  if (locals.profile?.role !== 'admin') return fail(403, { erro: 'Só admin' });
  return null;
}

export async function carregarAgendamentosEExcecoes(
  supabase: SupabaseClient
): Promise<{ agendamentos: AgendamentoBase[]; excecoes: ExcecaoBase[] }> {
  const [aRes, eRes] = await Promise.all([
    supabase.from('tp_agendamentos').select('*').eq('ativo', true),
    supabase.from('tp_agendamento_excecoes').select('*')
  ]);
  return {
    agendamentos: (aRes.data ?? []) as AgendamentoBase[],
    excecoes: (eRes.data ?? []) as ExcecaoBase[]
  };
}

// Janela pra checar conflito de série recorrente: até `recorrencia_fim`, ou
// 2 anos à frente se a série não tem fim definido (limite prático).
export function janelaChecagem(recorrenciaFim: string | null): string {
  if (recorrenciaFim) return recorrenciaFim;
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return d.toISOString().slice(0, 10);
}
