import type { PageServerLoad } from './$types';
import { listarDesignacoes, listarQuadrasComGeo, type QuadraGeo } from '$lib/server/queries';

// TP-? / navegação: aba dedicada de "casa em casa" — mapa com GPS pra
// identificar qual quadra é qual dentro do território designado agora
// (território pessoal + parte de pregação em grupo + arranjo que dirijo),
// disponível pra publicador E dirigente (a home só mostra chips/lista,
// isso aqui é o mapa). Reaproveita as mesmas fontes de dados do home.
export const load: PageServerLoad = async ({ locals }) => {
  const ontem = new Date(Date.now() - 86400000).toISOString().substring(0, 10);

  const [designacoes, quadras, partesRes, dirijoRes] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarQuadrasComGeo(locals.supabase),
    locals.supabase
      .from('arranjo_partes')
      .select('quadras_ids, arranjos!inner(ativo)')
      .contains('publicadores', [locals.user!.id])
      .eq('arranjos.ativo', true),
    locals.supabase
      .from('arranjos')
      .select('quadras_ids')
      .eq('ativo', true)
      .eq('dirigente_id', locals.user!.id)
      .or(`data.gte.${ontem},data.is.null`)
  ]);

  const minhasComoLider = designacoes.filter((d) => d.publicador_id === locals.user!.id && d.status === 'aberta' && d.tipo !== 'cartas');
  const idsPessoais = minhasComoLider.flatMap((d) => d.quadras_ids);
  const idsPartes = ((partesRes.data ?? []) as any[]).flatMap((p) => (p.quadras_ids ?? []) as string[]);
  const idsDirijo = ((dirijoRes.data ?? []) as any[]).flatMap((a) => (a.quadras_ids ?? []) as string[]);

  const idsRelevantes = [...new Set([...idsPessoais, ...idsPartes, ...idsDirijo])];
  const quadrasMap = new Map(quadras.map((q) => [q.id, q]));
  const minhasQuadras = idsRelevantes.map((id) => quadrasMap.get(id)).filter(Boolean) as QuadraGeo[];

  return { quadras: minhasQuadras };
};
