import type { PageServerLoad } from './$types';
import { selectAll } from '$lib/server/queries';

export interface ArranjoLinha {
  id: number;
  tipo: string;
  status: string;
  data_encontro: string | null;
  hora_encontro: string | null;
  ponto_encontro_endereco: string | null;
  notas: string | null;
  dirigente_id: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return { arranjos: [], dirigenteNomes: {}, quadrasPorArranjo: {}, participantesPorArranjo: {} };

  // Pega TODOS os arranjos abertos onde o user é participante (RLS pode permitir mais se for dirigente)
  const arranjos = await selectAll<ArranjoLinha>(
    locals.supabase
      .from('designacoes')
      .select('id, tipo, status, data_encontro, hora_encontro, ponto_encontro_endereco, notas, dirigente_id')
      .eq('tipo', 'arranjo')
      .eq('status', 'aberta')
      .order('data_encontro', { ascending: true })
  );

  const arranjoIds = arranjos.map((a) => a.id);

  // Carrega quadras de cada arranjo
  const quadrasPorArranjo: Record<number, string[]> = {};
  if (arranjoIds.length > 0) {
    const { data: linhas } = await locals.supabase
      .from('designacao_quadras')
      .select('designacao_id, quadra_id')
      .in('designacao_id', arranjoIds);
    for (const l of linhas ?? []) {
      const arr = quadrasPorArranjo[l.designacao_id] ?? [];
      arr.push(l.quadra_id);
      quadrasPorArranjo[l.designacao_id] = arr;
    }
  }

  // Participantes de cada arranjo
  const participantesPorArranjo: Record<number, { id: string; nome: string; papel: string }[]> = {};
  if (arranjoIds.length > 0) {
    const { data: linhas } = await locals.supabase
      .from('designacao_publicadores')
      .select('designacao_id, publicador_id, papel, profiles(nome)')
      .in('designacao_id', arranjoIds);
    for (const l of (linhas ?? []) as any[]) {
      const arr = participantesPorArranjo[l.designacao_id] ?? [];
      arr.push({ id: l.publicador_id, nome: l.profiles?.nome ?? '?', papel: l.papel });
      participantesPorArranjo[l.designacao_id] = arr;
    }
  }

  // Nome do dirigente
  const dirigenteIds = [...new Set(arranjos.map((a) => a.dirigente_id).filter(Boolean) as string[])];
  const dirigenteNomes: Record<string, string> = {};
  if (dirigenteIds.length > 0) {
    const { data: profs } = await locals.supabase.from('profiles').select('id, nome').in('id', dirigenteIds);
    for (const p of profs ?? []) dirigenteNomes[p.id] = p.nome;
  }

  return { arranjos, dirigenteNomes, quadrasPorArranjo, participantesPorArranjo };
};
