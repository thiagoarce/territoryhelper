import type { Actions, PageServerLoad } from './$types';
import { hojeIsoBrasil } from '$lib/utils/data';
import { error, fail } from '@sveltejs/kit';
import { carregarPredioDetalhado, selectAll, cicloCartasAtual } from '$lib/server/queries';
import { desfechoNoCicloAtual, cartaEscritaNoCiclo } from '$lib/ciclos';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Faça login');
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) throw error(400, 'ID inválido');
  const ciclo = await cicloCartasAtual(locals.supabase);
  const predio = await carregarPredioDetalhado(locals.supabase, id, ciclo?.iniciado_em);
  if (!predio) throw error(404, 'Prédio não encontrado');

  // Ciclo do casa em casa = última conclusão da quadra do prédio
  let dataConclusaoQuadra: string | null = null;
  if (predio.quadra_id) {
    const { data: q } = await locals.supabase
      .from('quadras').select('data_conclusao').eq('id', predio.quadra_id).maybeSingle();
    dataConclusaoQuadra = q?.data_conclusao ?? null;
  }

  // Enriquece unidades com último registro (pra modo casa-em-casa)
  const unidadeIds = predio.unidades.map((u) => u.id);
  let ultimoPorUnidade: Record<number, { tipo: string; ts: string }> = {};
  if (unidadeIds.length > 0) {
    const registros = await selectAll<{ unidade_id: number; tipo: string; ts: string }>(
      locals.supabase
        .from('registros')
        .select('unidade_id, tipo, ts')
        .in('unidade_id', unidadeIds)
        .order('ts', { ascending: false })
    );
    for (const r of registros) {
      if (!ultimoPorUnidade[r.unidade_id]) {
        ultimoPorUnidade[r.unidade_id] = { tipo: r.tipo, ts: r.ts };
      }
    }
  }
  // Nome de quem escreveu a carta (aba Cartas mostra pequeno ao lado da data)
  const escritores = [...new Set(predio.unidades.map((u: any) => u.carta_escrita_por).filter(Boolean))] as string[];
  let nomeEscritorPorId = new Map<string, string>();
  if (escritores.length > 0) {
    const { data: profs } = await locals.supabase.from('profiles').select('id, nome').in('id', escritores);
    nomeEscritorPorId = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
  }

  const unidades = predio.unidades.map((u: any) => {
    const ult = ultimoPorUnidade[u.id];
    const noCiclo = desfechoNoCicloAtual(ult?.ts, dataConclusaoQuadra);
    const ehDesfeito = ult?.tipo === 'desfeito' || ult?.tipo === 'carta_undo';
    return {
      ...u,
      ultimo_tipo: noCiclo ? ult?.tipo ?? null : null,
      ultimo_ts: noCiclo ? ult?.ts ?? null : null,
      desfecho_anterior: !noCiclo && ult && !ehDesfeito ? ult.tipo : null,
      desfecho_anterior_ts: !noCiclo && ult && !ehDesfeito ? ult.ts : null,
      carta_escrita_por_nome: u.carta_escrita_por ? nomeEscritorPorId.get(u.carta_escrita_por) ?? null : null
    };
  });

  return {
    predio: { ...predio, unidades },
    minhaRole: locals.profile?.role,
    cicloCartasInicio: ciclo?.iniciado_em ?? null
  };
};

const DESFECHOS_VALIDOS = ['conversou', 'semConversa', 'naoAtendeu', 'carta', ''] as const;

// Defesa em profundidade: sem isso, um UPDATE/INSERT bloqueado pela RLS
// (publicador sem posse desse prédio) retorna sucesso silencioso — o
// publicador vê toast de sucesso (ou fica preso no overlay otimista da
// fila offline) sem nada ter sido salvo de verdade.
async function podeEditarLocal(locals: App.Locals, localId: number): Promise<boolean> {
  const { data, error: err } = await locals.supabase.rpc('pode_editar_local', { p_local_id: localId });
  if (err) return false;
  return !!data;
}

async function localIdDaUnidade(locals: App.Locals, unidadeId: number): Promise<number | null> {
  const { data } = await locals.supabase.from('unidades').select('local_id').eq('id', unidadeId).maybeSingle();
  return data?.local_id ?? null;
}

export const actions: Actions = {
  // Casa-em-casa: append registro. Tipo vazio = desfeito.
  marcarDesfecho: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const tipo = String(fd.get('tipo') ?? '');
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });
    if (!DESFECHOS_VALIDOS.includes(tipo as any)) return fail(400, { erro: 'tipo inválido' });
    const localId = await localIdDaUnidade(locals, unidadeId);
    if (!localId || !(await podeEditarLocal(locals, localId))) {
      return fail(403, { erro: 'Você não tem posse dessa unidade' });
    }
    const tipoFinal = tipo === '' ? 'desfeito' : tipo;
    const { error: err } = await locals.supabase
      .from('registros')
      .insert({ unidade_id: unidadeId, tipo: tipoFinal, publicador_id: locals.user.id });
    if (err) return fail(400, { erro: err.message });
    return { ok: true };
  },

  // Cartas: toggle carta_entregue (date) / desocupado / nao_escrever (bool).
  // Mesma semântica do RPC público carta_publica_toggle.
  toggle: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const localId = Number(params.id);
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const campo = String(fd.get('campo') ?? '');
    if (!unidadeId || !['carta_entregue', 'desocupado', 'nao_escrever'].includes(campo)) {
      return fail(400, { erro: 'Parâmetros inválidos' });
    }
    const { data: u, error: errU } = await locals.supabase
      .from('unidades')
      .select('id, local_id, carta_entregue, desocupado, nao_escrever')
      .eq('id', unidadeId)
      .maybeSingle();
    if (errU || !u) return fail(404, { erro: 'Unidade não encontrada' });
    if (u.local_id !== localId) return fail(400, { erro: 'Unidade não pertence a este prédio' });
    if (!(await podeEditarLocal(locals, localId))) return fail(403, { erro: 'Você não tem posse desse prédio' });
    const patch: Record<string, unknown> = {};
    if (campo === 'carta_entregue') {
      // Semântica: carta ESCRITA (a entrega é o desfecho casa-em-casa).
      // Marca de ciclo PASSADO conta como não-escrita: o toggle re-escreve
      // com a data de hoje em vez de desmarcar. Desmarcar limpa data+autor.
      const ciclo = await cicloCartasAtual(locals.supabase);
      const escrevendo = !cartaEscritaNoCiclo(u.carta_entregue, ciclo?.iniciado_em);
      patch.carta_entregue = escrevendo ? hojeIsoBrasil() : null;
      patch.carta_escrita_por = escrevendo ? locals.user.id : null;
    } else if (campo === 'desocupado') {
      patch.desocupado = !u.desocupado;
    } else {
      patch.nao_escrever = !u.nao_escrever;
    }
    const { error: errUp } = await locals.supabase.from('unidades').update(patch).eq('id', unidadeId);
    if (errUp) return fail(400, { erro: errUp.message });
    return { ok: true };
  },

  // Edit modal — atualiza overlay do prédio (mesma lógica de /admin/predios)
  atualizarLocal: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const localId = Number(params.id);
    if (!(await podeEditarLocal(locals, localId))) return fail(403, { erro: 'Você não tem posse desse prédio' });
    const fd = await request.formData();
    const permitidos = ['nome', 'irmao_mora', 'nome_irmao', 'notas', 'tipo_entrada', 'acesso_caixas', 'acesso_interfones', 'nao_visitar'];
    const booleanos = new Set(['irmao_mora', 'acesso_caixas', 'acesso_interfones', 'nao_visitar']);
    const patch: Record<string, unknown> = {};
    for (const k of permitidos) {
      if (!fd.has(k)) continue;
      const v = fd.get(k);
      if (booleanos.has(k)) patch[k] = v === 'on' || v === 'true';
      else {
        const s = String(v ?? '').trim();
        patch[k] = s === '' ? null : s;
      }
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error: err } = await locals.supabase.from('locais').update(patch).eq('id', localId);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Atualizado' };
  },

  // WhatsApp share — gera token público de cartas
  gerarLink: async ({ locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const localId = Number(params.id);
    const { data, error } = await locals.supabase
      .from('cartas_tokens')
      .insert({ local_id: localId, criado_por: locals.user.id })
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, token: data.token };
  }
};
