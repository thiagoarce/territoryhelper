import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { criarNotificacao } from '$lib/server/push';

export interface TpDisponibilidadeLinha {
  id: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || !locals.profile) throw redirect(303, '/login');

  const [prefRes, dispRes] = await Promise.all([
    locals.supabase
      .from('tp_preferencias')
      .select('transporta_carrinho, notas')
      .eq('publicador_id', locals.user.id)
      .maybeSingle(),
    locals.supabase
      .from('tp_disponibilidade')
      .select('id, dia_semana, hora_inicio, hora_fim')
      .eq('publicador_id', locals.user.id)
      .order('dia_semana')
      .order('hora_inicio')
  ]);

  return {
    profile: locals.profile,
    email: locals.user.email,
    tpPreferencias: prefRes.data ?? { transporta_carrinho: false, notas: null },
    tpDisponibilidade: (dispRes.data ?? []) as TpDisponibilidadeLinha[]
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

  // TP-B: preferência de transporte do equipamento — upsert (1 linha por publicador)
  salvarPreferenciasTp: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const transportaCarrinho = fd.get('transporta_carrinho') === 'on';
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const { error } = await locals.supabase
      .from('tp_preferencias')
      .upsert(
        { publicador_id: locals.user.id, transporta_carrinho: transportaCarrinho, notas, atualizado_em: new Date().toISOString() },
        { onConflict: 'publicador_id' }
      );
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Preferências salvas' };
  },

  adicionarDisponibilidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const diaSemana = Number(fd.get('dia_semana') ?? -1);
    const horaInicio = String(fd.get('hora_inicio') ?? '').trim();
    const horaFim = String(fd.get('hora_fim') ?? '').trim();
    if (diaSemana < 0 || diaSemana > 6) return fail(400, { erro: 'Dia da semana inválido' });
    if (!horaInicio || !horaFim) return fail(400, { erro: 'Horário obrigatório' });
    if (horaFim <= horaInicio) return fail(400, { erro: 'Hora de fim precisa ser depois da hora de início' });
    const { error } = await locals.supabase.from('tp_disponibilidade').insert({
      publicador_id: locals.user.id,
      dia_semana: diaSemana,
      hora_inicio: horaInicio,
      hora_fim: horaFim
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Janela adicionada' };
  },

  removerDisponibilidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_disponibilidade').delete().eq('id', id).eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Janela removida' };
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
    await criarNotificacao([locals.user.id], {
      titulo: 'Oi!',
      corpo: 'Notificação de teste do Territory Helper — se você recebeu isso, tá tudo funcionando.'
    });
    return { ok: true, msg: 'Notificação de teste enviada' };
  }
};
