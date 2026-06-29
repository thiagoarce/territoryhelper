import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { carregarQuadraComLocais } from '$lib/server/queries';

const DESFECHOS_VALIDOS = ['conversou', 'semConversa', 'naoAtendeu', ''] as const;

export const load: PageServerLoad = async ({ locals, params }) => {
  const dados = await carregarQuadraComLocais(locals.supabase, params.id);
  if (!dados) throw error(404, 'Quadra não encontrada');
  return dados;
};

export const actions: Actions = {
  // Marca desfecho mutex (naoAtendeu | semConversa | conversou) numa unidade.
  // Tipo vazio = "desfeito" (undo). Insere row em registros (append-only).
  marcarDesfecho: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const tipo = String(fd.get('tipo') ?? '');
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });
    if (!DESFECHOS_VALIDOS.includes(tipo as any)) {
      return fail(400, { erro: 'tipo inválido' });
    }
    const tipoFinal = tipo === '' ? 'desfeito' : tipo;
    const { error: err } = await locals.supabase
      .from('registros')
      .insert({
        unidade_id: unidadeId,
        tipo: tipoFinal,
        publicador_id: locals.user.id
      });
    if (err) return fail(400, { erro: err.message });
    return { ok: true };
  },

  // Atualiza overlay de um local (prédio/casa). Campos permitidos:
  // nome, irmao_mora, nome_irmao, notas, tipo_entrada, acesso_caixas,
  // acesso_interfones, nao_visitar. Bloqueia mudança em geo/logradouro/etc.
  atualizarLocal: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const permitidos = ['nome', 'irmao_mora', 'nome_irmao', 'notas', 'tipo_entrada', 'acesso_caixas', 'acesso_interfones', 'nao_visitar'];
    const patch: Record<string, unknown> = {};
    for (const k of permitidos) {
      if (!fd.has(k)) continue;
      const v = fd.get(k);
      if (k === 'irmao_mora' || k === 'acesso_caixas' || k === 'acesso_interfones' || k === 'nao_visitar') {
        patch[k] = v === 'on' || v === 'true';
      } else {
        const s = String(v ?? '').trim();
        patch[k] = s === '' ? null : s;
      }
    }
    const { error: err } = await locals.supabase.from('locais').update(patch).eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Local atualizado' };
  },

  // Atualiza overlay de uma unidade. Campos: complemento, nota,
  // desocupado, nao_escrever.
  atualizarUnidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const permitidos = ['complemento', 'nota', 'desocupado', 'nao_escrever'];
    const patch: Record<string, unknown> = {};
    for (const k of permitidos) {
      if (!fd.has(k)) continue;
      const v = fd.get(k);
      if (k === 'desocupado' || k === 'nao_escrever') patch[k] = v === 'on' || v === 'true';
      else {
        const s = String(v ?? '').trim();
        patch[k] = s === '' ? null : s;
      }
    }
    const { error: err } = await locals.supabase.from('unidades').update(patch).eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Unidade atualizada' };
  },

  // Exclui unidade (cascade limpa registros dela). Irreversível.
  excluirUnidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error: err } = await locals.supabase.from('unidades').delete().eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Unidade excluída' };
  },

  // Marca/desmarca carta entregue. Atualiza unidades.carta_entregue (date)
  // E insere em registros pra trilha histórica.
  toggleCarta: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const marcar = fd.get('marcar') === 'true';
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });

    const hoje = new Date().toISOString().substring(0, 10);
    const { error: errUpd } = await locals.supabase
      .from('unidades')
      .update({ carta_entregue: marcar ? hoje : null })
      .eq('id', unidadeId);
    if (errUpd) return fail(400, { erro: errUpd.message });

    const { error: errReg } = await locals.supabase
      .from('registros')
      .insert({
        unidade_id: unidadeId,
        tipo: marcar ? 'carta' : 'carta_undo',
        publicador_id: locals.user.id
      });
    if (errReg) return fail(400, { erro: errReg.message });

    return { ok: true };
  }
};
