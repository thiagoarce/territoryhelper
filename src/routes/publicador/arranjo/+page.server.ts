import type { PageServerLoad } from './$types';
import { selectAll } from '$lib/server/queries';
import type { ArranjoBase } from '$lib/arranjos';

export interface ArranjoLinha extends ArranjoBase {}

export interface ModalidadeLite {
  id: number;
  nome: string;
  tipo_territorio: string;
  cor: string;
}

export interface PredioChip {
  id: number;
  logradouro: string | null;
  numero: string | null;
  nome: string | null;
  qtd_aptos: number;
  qtd_entregues: number;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return { arranjos: [], modalidades: [], dirigentes: {}, prediosMap: {} as Record<number, PredioChip> };

  const [arranjos, modalidades, { data: profs }] = await Promise.all([
    selectAll<ArranjoLinha>(
      locals.supabase
        .from('arranjos')
        .select('*')
        .eq('ativo', true)
        .order('dia_semana', { nullsFirst: false })
        .order('hora_inicio', { nullsFirst: false })
    ),
    selectAll<ModalidadeLite>(
      locals.supabase.from('arranjo_modalidades').select('id, nome, tipo_territorio, cor')
    ),
    locals.supabase.from('profiles').select('id, nome').in('role', ['dirigente', 'admin'])
  ]);

  const dirigentes: Record<string, string> = {};
  for (const p of profs ?? []) dirigentes[p.id] = p.nome;

  // Coleta ids únicos de prédios referenciados nos arranjos e busca detalhes + stats
  const predioIds = Array.from(
    new Set(arranjos.flatMap((a) => a.cartas_locais_ids ?? []).filter((n) => Number.isFinite(n)))
  );
  const prediosMap: Record<number, PredioChip> = {};
  if (predioIds.length > 0) {
    const [locaisRes, unidsRes] = await Promise.all([
      locals.supabase.from('locais').select('id, logradouro, numero, nome').in('id', predioIds),
      selectAll<{ local_id: number; carta_entregue: string | null }>(
        locals.supabase.from('unidades').select('local_id, carta_entregue').in('local_id', predioIds)
      )
    ]);
    const stats: Record<number, { qtd: number; ent: number }> = {};
    for (const u of unidsRes) {
      const s = (stats[u.local_id] ||= { qtd: 0, ent: 0 });
      s.qtd++;
      if (u.carta_entregue) s.ent++;
    }
    for (const l of (locaisRes.data ?? []) as any[]) {
      const s = stats[l.id] ?? { qtd: 0, ent: 0 };
      prediosMap[l.id] = {
        id: l.id,
        logradouro: l.logradouro,
        numero: l.numero,
        nome: l.nome,
        qtd_aptos: s.qtd,
        qtd_entregues: s.ent
      };
    }
  }

  return { arranjos, modalidades, dirigentes, prediosMap };
};
