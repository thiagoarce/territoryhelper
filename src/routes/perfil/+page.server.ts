import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { criarNotificacao } from '$lib/server/push';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || !locals.profile) throw redirect(303, '/login');

  // Diagnóstico de push: quantos aparelhos deste usuário têm subscription
  // salva (RLS: só as próprias linhas são visíveis).
  const { count } = await locals.supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('publicador_id', locals.user.id);

  return {
    profile: locals.profile,
    email: locals.user.email,
    qtdPushSubscriptions: count ?? 0
  };
};

export const actions: Actions = {
  // Atualiza nome próprio (RLS permite via profiles_update_self)
  atualizarNome: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const { error } = await locals.supabase.from('profiles').update({ nome }).eq('id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Nome atualizado' };
  },

  // T6 (A14): estilo de mapa é preferência global (todos os mapas de
  // MapaAdmin/MapaPoligonos/AdminMapa leem `profiles.pref_basemap`).
  atualizarBasemap: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const basemap = String(fd.get('basemap') ?? '');
    if (!['positron', 'liberty', 'bright'].includes(basemap)) return fail(400, { erro: 'Estilo inválido' });
    const { error } = await locals.supabase
      .from('profiles')
      .update({ pref_basemap: basemap })
      .eq('id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Estilo do mapa atualizado' };
  },

  // Troca senha — usa auth.updateUser direto
  trocarSenha: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const senha = String(fd.get('senha') ?? '');
    if (senha.length < 6) return fail(400, { erro: 'Senha precisa de 6+ caracteres' });
    const { error } = await locals.supabase.auth.updateUser({ password: senha });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Senha trocada' };
  },

  // PUSH-A: grava a subscription do Web Push deste dispositivo. Upsert por
  // endpoint (unique) — resubscrever o mesmo device reaproveita a linha.
  registrarPush: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const endpoint = String(fd.get('endpoint') ?? '').trim();
    const p256dh = String(fd.get('p256dh') ?? '').trim();
    const auth = String(fd.get('auth') ?? '').trim();
    const userAgent = String(fd.get('user_agent') ?? '').trim() || null;
    if (!endpoint || !p256dh || !auth) return fail(400, { erro: 'Subscription incompleta' });
    const { error } = await locals.supabase.from('push_subscriptions').upsert(
      { publicador_id: locals.user.id, endpoint, p256dh, auth, user_agent: userAgent, falhas: 0 },
      { onConflict: 'endpoint' }
    );
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Notificações ativadas' };
  },

  removerPush: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const endpoint = String(fd.get('endpoint') ?? '').trim();
    if (!endpoint) return fail(400, { erro: 'endpoint obrigatório' });
    const { error } = await locals.supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Notificações desativadas' };
  },

  // Manda uma notificação de teste pra si mesmo — valida o pipeline
  // completo (sino + tickle de Web Push assinado com as chaves VAPID).
  enviarTeste: async ({ locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const resumo = await criarNotificacao([locals.user.id], {
      titulo: 'Oi!',
      corpo: 'Notificação de teste do Territory Helper — se você recebeu isso, tá tudo funcionando.'
    });
    // Devolve o que o servidor VIU — antes o resultado real do envio
    // morria no console do Worker e o diagnóstico virava adivinhação.
    if (!resumo) return { ok: true, msg: 'Sino atualizado (sem detalhes do push)' };
    if (!resumo.configurado) return { ok: true, msg: 'Sino atualizado. Web Push: chaves VAPID NÃO configuradas no servidor (runtime)' };
    if (resumo.aparelhos === 0) return { ok: true, msg: 'Sino atualizado. Web Push: nenhum aparelho inscrito — ative as notificações neste aparelho primeiro' };
    return { ok: true, msg: `Sino atualizado. Web Push: ${resumo.entregues}/${resumo.aparelhos} aparelho(s) receberam do serviço de push${resumo.falhas > 0 ? ` (${resumo.falhas} falha(s) — ver logs)` : ''}` };
  }
};
