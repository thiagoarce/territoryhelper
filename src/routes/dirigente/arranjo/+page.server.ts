import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { selectAll, listarPublicadores } from '$lib/server/queries';
import type { ArranjoBase } from '$lib/arranjos';

export interface ArranjoLinha extends ArranjoBase {}

export interface ModalidadeLite {
  id: number;
  nome: string;
  tipo_territorio: string;
  cor: string;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    return { arranjos: [], modalidades: [], dirigentes: {}, publicadores: [], minhaId: '', podeCoordenar: false };
  }

  const podeCoordenar = ['dirigente', 'admin'].includes(locals.profile?.role ?? '');

  const [arranjos, modalidades, { data: profs }, publicadores] = await Promise.all([
    selectAll<ArranjoLinha>(
      locals.supabase
        .from('arranjos')
        .select('*')
        .eq('ativo', true)
        .order('dia_semana', { nullsFirst: false })
        .order('hora_inicio', { nullsFirst: false })
    ),
    selectAll<ModalidadeLite>(
      locals.supabase
        .from('arranjo_modalidades')
        .select('id, nome, tipo_territorio, cor')
    ),
    locals.supabase
      .from('profiles')
      .select('id, nome')
      .in('role', ['dirigente', 'admin']),
    podeCoordenar ? listarPublicadores(locals.supabase) : Promise.resolve([])
  ]);

  const dirigenteNomes: Record<string, string> = {};
  for (const p of profs ?? []) dirigenteNomes[p.id] = p.nome;

  return {
    arranjos,
    modalidades,
    dirigentes: dirigenteNomes,
    publicadores,
    minhaId: locals.user.id,
    podeCoordenar
  };
};

export const actions: Actions = {
  // Distribui quadras de um arranjo aos publicadores: cria designacoes pessoais
  // com todas as quadras do arranjo pra cada publicador selecionado.
  distribuirQuadras: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const publicadores = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);
    if (!arranjoId) return fail(400, { erro: 'arranjo_id obrigatório' });
    if (publicadores.length === 0) return fail(400, { erro: 'Selecione ao menos um publicador' });

    // Defesa em profundidade: dirigente só distribui arranjos que ele dirige.
    // Admin distribui qualquer um. RLS de leitura é aberta, mas escopo de ação
    // é restrito aqui no servidor.
    const ehAdmin = locals.profile?.role === 'admin';
    const { data: arr, error: errA } = await locals.supabase
      .from('arranjos')
      .select('id, quadras_ids, modalidade_id, nome, local_endereco, hora_inicio, dirigente_id')
      .eq('id', arranjoId)
      .single();
    if (errA || !arr) return fail(400, { erro: 'Arranjo não encontrado' });
    if (!ehAdmin && arr.dirigente_id !== locals.user.id) {
      return fail(403, { erro: 'Você não é o dirigente desse arranjo' });
    }
    const quadras = (arr.quadras_ids ?? []) as string[];
    if (quadras.length === 0) return fail(400, { erro: 'Arranjo não tem quadras pra distribuir' });

    for (const pubId of publicadores) {
      const { data: des, error: errD } = await locals.supabase
        .from('designacoes')
        .insert({
          tipo: 'pessoal',
          status: 'aberta',
          criado_por: locals.user.id,
          dirigente_id: locals.user.id,
          publicador_id: pubId,
          prazo,
          notas: `Distribuído do arranjo "${arr.nome ?? ''}".`
        })
        .select('id')
        .single();
      if (errD || !des) continue;

      await locals.supabase.from('designacao_quadras').insert(
        quadras.map((qid) => ({ designacao_id: des.id, quadra_id: qid }))
      );
      await locals.supabase
        .from('designacao_publicadores')
        .insert({ designacao_id: des.id, publicador_id: pubId, papel: 'lider' });
    }

    return { ok: true, msg: `Distribuído pra ${publicadores.length} publicador(es)` };
  }
};
