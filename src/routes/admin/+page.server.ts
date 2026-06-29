import type { PageServerLoad } from './$types';
import { listarQuadrasComGeo, listarDesignacoes, selectAll } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [quadras, designacoes] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase)
  ]);
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  // Quadras "alocadas" = quadras que aparecem em alguma designação aberta
  const quadrasAlocadas = new Set<string>();
  for (const d of abertas) for (const q of d.quadras_ids) quadrasAlocadas.add(q);

  // Stats do mês: count de registros por dia, dos últimos 30 dias
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
  const registrosRecentes = await selectAll<{ ts: string; tipo: string }>(
    locals.supabase
      .from('registros')
      .select('ts, tipo')
      .gte('ts', trintaDiasAtras.toISOString())
      .order('ts', { ascending: false })
  );

  // Agrupa por dia (yyyy-mm-dd)
  const porDia = new Map<string, number>();
  const porTipo = new Map<string, number>();
  for (const r of registrosRecentes) {
    const dia = r.ts.substring(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    porTipo.set(r.tipo, (porTipo.get(r.tipo) ?? 0) + 1);
  }

  // Designações com prazo vencendo (próximos 7 dias) ou vencidas
  const hoje = new Date();
  const semana = new Date();
  semana.setDate(semana.getDate() + 7);
  const prazosVencendo = abertas
    .filter((d) => {
      if (!d.prazo) return false;
      const p = new Date(d.prazo + 'T12:00:00');
      return p <= semana;
    })
    .sort((a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? ''));

  return {
    quadras,
    designacoesAbertas: abertas,
    quadrasAlocadas: [...quadrasAlocadas],
    registrosMes: registrosRecentes.length,
    porDia: Object.fromEntries(porDia),
    porTipo: Object.fromEntries(porTipo),
    prazosVencendo
  };
};
