// W5: o LOAD desta rota mora em +page.ts (universal, roda no BROWSER
// com ssr=false, com cache offline) — a home/carteira abre sem rede com
// o último estado. Este arquivo fica só com as ACTIONS.
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const actions: Actions = {
  // Link público /t/<token> — da PRÓPRIA designação (RLS permite o dono)
  // OU de um arranjo (dirigente/admin, pelo card "Você dirige")
  gerarLinkTerritorio: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const designacaoId = Number(fd.get('designacao_id') ?? 0);
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!designacaoId && !arranjoId) return fail(400, { erro: 'id obrigatório' });
    const row: any = { criado_por: locals.user.id };
    if (arranjoId) row.arranjo_id = arranjoId;
    else row.designacao_id = designacaoId;
    const { data, error } = await locals.supabase
      .from('territorio_tokens')
      .insert(row)
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, token: data.token };
  },

  // Pedido de publicação avulso (P-A) — catálogo OU descrição livre.
  pedirPublicacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0) || null;
    const descricao = String(fd.get('descricao') ?? '').trim() || null;
    const qtd = Number(fd.get('qtd') ?? 1) || 1;
    if (!publicacaoId && !descricao) return fail(400, { erro: 'Escolha uma publicação do catálogo ou descreva o que precisa' });
    const { error } = await locals.supabase.from('pedidos_publicacao').insert({
      publicador_id: locals.user.id,
      publicacao_id: publicacaoId,
      descricao: publicacaoId ? null : descricao,
      qtd
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Pedido enviado ao servo de publicações' };
  },

  // Cancela um pedido MEU ainda aberto (RLS só deixa enquanto status='aberto')
  cancelarPedidoPublicacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('pedidos_publicacao')
      .update({ status: 'cancelado' })
      .eq('id', id)
      .eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Pedido cancelado' };
  },

  // "Normalmente preciso de N por edição" — Despertai/Sentinela chegam
  // pela via normal, isso é só uma preferência informativa pro servo, não
  // um pedido com status (diferente de pedirPublicacao acima).
  salvarNecessidadeRegular: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0);
    const variante = String(fd.get('variante') ?? 'publico');
    const qtd = Number(fd.get('qtd') ?? 0);
    const letrasGrandes = fd.get('letras_grandes') === 'true';
    if (!publicacaoId) return fail(400, { erro: 'publicacao_id obrigatório' });
    if (!['publico', 'estudo'].includes(variante)) return fail(400, { erro: 'variante inválida' });
    if (qtd < 0) return fail(400, { erro: 'Quantidade inválida' });
    const { error } = await locals.supabase.from('publicador_necessidade_regular').upsert(
      {
        publicador_id: locals.user.id, publicacao_id: publicacaoId, variante, qtd,
        letras_grandes: letrasGrandes, atualizado_em: new Date().toISOString()
      },
      { onConflict: 'publicador_id,publicacao_id,variante' }
    );
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Salvo' };
  }
};
