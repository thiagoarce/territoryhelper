// W9: load foi pro +page.ts (universal, browser). Aqui só ficam as
// actions — mutações continuam no Worker por defesa em profundidade.
import type { Actions } from './$types';
import { hojeIsoBrasil } from '$lib/utils/data';
import { fail } from '@sveltejs/kit';
import { cicloCartasPorLocal, cicloEfetivo } from '$lib/server/queries';
import { exigirAdminAction } from '$lib/server/guards';
import { cartaEscritaNoCiclo } from '$lib/ciclos';
import { registrarCuradoria, snapshotAntes } from '$lib/server/curadoria';

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
      const ciclosU = await cicloCartasPorLocal(locals.supabase, [localId]);
      const cicloU = cicloEfetivo(ciclosU, localId);
      const escrevendo = !cartaEscritaNoCiclo(u.carta_entregue, cicloU?.iniciado_em);
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
  // Overlay é edição LIVRE (sem posse) desde a migration 057 — o trigger
  // do banco barra coluna estrutural e a curadoria registra pro admin.
  atualizarLocal: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const localId = Number(params.id);
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
    const { data: atual } = await locals.supabase.from('locais').select('*').eq('id', localId).maybeSingle();
    const { error: err } = await locals.supabase.from('locais').update(patch).eq('id', localId);
    if (err) return fail(400, { erro: err.message });
    await registrarCuradoria(locals, { local_id: localId, tipo: 'edicao', antes: snapshotAntes(atual, patch), depois: patch });
    return { ok: true, msg: 'Atualizado' };
  },

  // A7: feedback "este endereço não existe mais" (ver mesmo padrão em
  // publicador/quadra/[id]).
  marcarNaoExiste: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const localId = Number(params.id);
    const fd = await request.formData();
    const marcar = fd.get('marcar') !== 'false';
    const patch = marcar
      ? { marcado_nao_existe: true, marcado_por: locals.user.id, marcado_em: new Date().toISOString() }
      : { marcado_nao_existe: false, marcado_por: null, marcado_em: null };
    const { error: err } = await locals.supabase.from('locais').update(patch).eq('id', localId);
    if (err) return fail(400, { erro: err.message });
    if (marcar) {
      await registrarCuradoria(locals, {
        local_id: localId, tipo: 'nao_existe',
        antes: { marcado_nao_existe: false }, depois: { marcado_nao_existe: true }
      });
    }
    return { ok: true, msg: marcar ? 'Marcado como "não existe mais"' : 'Desmarcado' };
  },

  // U2: publicador reporta posição errada — aplica na hora (via RPC
  // security definer que checa posse e bypassa a trava de coluna
  // estrutural só pra esta chamada) + registra curadoria pro admin
  // revisar/reverter, mesmo padrão do overlay livre (T11).
  reportarPosicao: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const localId = Number(params.id);
    const fd = await request.formData();
    const lat = fd.get('lat') ? Number(fd.get('lat')) : null;
    const lng = fd.get('lng') ? Number(fd.get('lng')) : null;
    const novaQuadraId = fd.get('nova_quadra_id') ? String(fd.get('nova_quadra_id')) : null;
    if (lat == null && !novaQuadraId) return fail(400, { erro: 'Nada pra atualizar' });

    const { data: atual } = await locals.supabase
      .from('locais').select('quadra_id, setor, quadra_ibge, face_ibge').eq('id', localId).maybeSingle();

    const novoGeo = lat != null && lng != null ? { type: 'Point', coordinates: [lng, lat] } : null;
    const { error: errRpc } = await locals.supabase.rpc('reportar_posicao_incorreta', {
      p_local_id: localId,
      p_novo_geo: novoGeo,
      p_nova_quadra_id: novaQuadraId
    });
    if (errRpc) return fail(400, { erro: errRpc.message });

    await registrarCuradoria(locals, {
      local_id: localId,
      tipo: 'edicao',
      antes: atual ?? null,
      depois: { quadra_id: novaQuadraId ?? atual?.quadra_id ?? null, geo: novoGeo ?? '(corrigido)' }
    });
    return { ok: true, msg: novaQuadraId ? `Movido pra quadra ${novaQuadraId}` : 'Posição corrigida' };
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
  },

  // A19: inicia um novo ciclo de cartas SÓ deste prédio (substitui o botão
  // global que ficava em /admin/predios — cada prédio termina de escrever
  // num momento diferente).
  iniciarCicloCartasLocal: async ({ locals, params }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    const localId = Number(params.id);
    const { error } = await locals.supabase
      .from('cartas_ciclos')
      .insert({ local_id: localId, iniciado_por: locals.user!.id });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Novo ciclo de cartas iniciado pra este prédio' };
  }
};
