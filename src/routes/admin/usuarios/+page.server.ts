import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import type { Role, UsuarioComEmail } from '$lib/types';

const ROLES_VALIDAS: Role[] = ['admin', 'dirigente', 'publicador'];

export const load: PageServerLoad = async () => {
  // Lista todos os auth users (paginação simples — pra <500 usuários é tudo).
  // Junta com profiles via id pra ter nome+role+ativo.
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  if (authErr) throw authErr;

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, nome, role, ativo, criado_em');

  const profilePorId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const usuarios: UsuarioComEmail[] = authData.users.map((u) => {
    const p = profilePorId.get(u.id);
    return {
      id: u.id,
      email: u.email ?? '',
      nome: p?.nome ?? '',
      role: (p?.role ?? 'publicador') as Role,
      ativo: p?.ativo ?? true,
      criado_em: p?.criado_em ?? u.created_at
    };
  });
  usuarios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const { data: convites } = await supabaseAdmin
    .from('convites')
    .select('id, email, nome, role, token, expira_em, usado_em, criado_em')
    .order('criado_em', { ascending: false })
    .limit(50);

  return { usuarios, convites: convites ?? [] };
};

export const actions: Actions = {
  // Cria 1 usuário (email + senha + nome + role).
  criar: async ({ request }) => {
    const fd = await request.formData();
    const email = String(fd.get('email') ?? '').trim().toLowerCase();
    const senha = String(fd.get('senha') ?? '');
    const nome = String(fd.get('nome') ?? '').trim();
    const role = String(fd.get('role') ?? 'publicador') as Role;

    if (!email || !senha || !nome) return fail(400, { erro: 'email, senha e nome são obrigatórios' });
    if (senha.length < 6) return fail(400, { erro: 'Senha precisa de pelo menos 6 caracteres' });
    if (!ROLES_VALIDAS.includes(role)) return fail(400, { erro: 'Role inválida' });

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome }
    });
    if (error) return fail(400, { erro: error.message });

    // Profile é criado por trigger SQL (handle_new_user) — só atualizamos role/nome.
    const { error: upErr } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: data.user.id, nome, role, ativo: true });
    if (upErr) return fail(400, { erro: upErr.message });

    return { ok: true, msg: `Usuário ${email} criado` };
  },

  // Atualiza role/ativo/nome de um usuário existente.
  atualizar: async ({ request }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const nome = String(fd.get('nome') ?? '').trim();
    const role = String(fd.get('role') ?? '') as Role;
    const ativo = fd.get('ativo') === 'on';

    if (!id) return fail(400, { erro: 'id obrigatório' });
    if (!ROLES_VALIDAS.includes(role)) return fail(400, { erro: 'Role inválida' });

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ nome, role, ativo })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });

    return { ok: true, msg: 'Atualizado' };
  },

  // Cria um convite — gera token único, irmão acessa /convite/[token] pra
  // definir email+senha.
  criarConvite: async ({ request, locals }) => {
    const fd = await request.formData();
    const email = String(fd.get('email') ?? '').trim().toLowerCase();
    const nome = String(fd.get('nome') ?? '').trim();
    const role = String(fd.get('role') ?? 'publicador') as Role;
    if (!email || !nome) return fail(400, { erro: 'email e nome obrigatórios' });
    if (!ROLES_VALIDAS.includes(role)) return fail(400, { erro: 'Role inválida' });
    const { data, error } = await supabaseAdmin
      .from('convites')
      .insert({ email, nome, role, criado_por: locals.user?.id ?? null })
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Convite criado', token: data.token };
  },

  revogarConvite: async ({ request }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await supabaseAdmin.from('convites').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Convite revogado' };
  },

  // Exclui usuário (auth + profile via CASCADE).
  excluir: async ({ request }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Usuário removido' };
  },

  // Import em lote. Textarea com linhas "email,senha,nome,role".
  // Tolerante: pula linhas vazias, reporta erros por linha, segue até o fim.
  importarLote: async ({ request }) => {
    const fd = await request.formData();
    const csv = String(fd.get('csv') ?? '').trim();
    if (!csv) return fail(400, { erro: 'CSV vazio' });

    const linhas = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const resultados: { linha: number; email: string; status: 'ok' | 'erro'; msg: string }[] = [];

    for (let i = 0; i < linhas.length; i++) {
      const partes = linhas[i].split(',').map((p) => p.trim());
      const [email, senha, nome, roleRaw] = partes;
      const role = (roleRaw || 'publicador') as Role;

      if (!email || !senha || !nome) {
        resultados.push({ linha: i + 1, email: email || '?', status: 'erro', msg: 'Faltam campos (email,senha,nome,role)' });
        continue;
      }
      if (senha.length < 6) {
        resultados.push({ linha: i + 1, email, status: 'erro', msg: 'Senha curta (<6)' });
        continue;
      }
      if (!ROLES_VALIDAS.includes(role)) {
        resultados.push({ linha: i + 1, email, status: 'erro', msg: `Role inválida: ${role}` });
        continue;
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        password: senha,
        email_confirm: true,
        user_metadata: { nome }
      });
      if (error) {
        resultados.push({ linha: i + 1, email, status: 'erro', msg: error.message });
        continue;
      }

      const { error: upErr } = await supabaseAdmin
        .from('profiles')
        .upsert({ id: data.user.id, nome, role, ativo: true });
      if (upErr) {
        resultados.push({ linha: i + 1, email, status: 'erro', msg: 'Auth criado mas profile falhou: ' + upErr.message });
        continue;
      }

      resultados.push({ linha: i + 1, email, status: 'ok', msg: `Criado como ${role}` });
    }

    const sucessos = resultados.filter((r) => r.status === 'ok').length;
    return {
      ok: true,
      lote: { resultados, sucessos, total: resultados.length }
    };
  }
};
