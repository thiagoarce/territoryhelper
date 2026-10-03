import { createInitialAdmin } from '$lib/installer/initial-admin';
import { assertEq, assertTrue, test } from './harness';

function fakeClient(options: { profileError?: string; existing?: boolean } = {}) {
  const calls: Array<{ name: string; value: unknown }> = [];
  const client: any = {
    auth: {
      admin: {
        listUsers: async () => {
          calls.push({ name: 'listUsers', value: null });
          return {
            data: {
              users: options.existing
                ? [{ id: 'user-1', email: 'jose@example.com', user_metadata: { origem: 'manual' } }]
                : []
            },
            error: null
          };
        },
        updateUserById: async (id: string, value: unknown) => {
          calls.push({ name: 'updateUserById', value: { id, value } });
          return { data: { user: { id } }, error: null };
        },
        createUser: async (value: unknown) => {
          calls.push({ name: 'createUser', value });
          return { data: { user: { id: 'user-1' } }, error: null };
        },
        deleteUser: async (value: unknown) => {
          calls.push({ name: 'deleteUser', value });
          return { data: {}, error: null };
        }
      }
    },
    from: (table: string) => ({
      upsert: async (value: unknown) => {
        calls.push({ name: `upsert:${table}`, value });
        return {
          data: null,
          error: options.profileError ? { message: options.profileError } : null
        };
      }
    })
  };
  return { client, calls };
}

test('assistente cria o primeiro usuário já confirmado e administrador', async () => {
  const { client, calls } = fakeClient();
  const result = await createInitialAdmin({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'secret',
    name: 'José da Silva',
    email: ' JOSE@EXAMPLE.COM ',
    password: 'senha-segura'
  }, () => client);

  assertEq(result, { id: 'user-1', email: 'jose@example.com', created: true });
  assertEq(calls[1], {
    name: 'createUser',
    value: {
      email: 'jose@example.com',
      password: 'senha-segura',
      email_confirm: true,
      user_metadata: { nome: 'José da Silva' }
    }
  });
  assertEq(calls[2], {
    name: 'upsert:profiles',
    value: { id: 'user-1', nome: 'José da Silva', role: 'admin', ativo: true }
  });
});

test('assistente reutiliza e promove usuário que já existe no Supabase', async () => {
  const { client, calls } = fakeClient({ existing: true });
  const result = await createInitialAdmin({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'secret',
    name: 'José da Silva',
    email: 'jose@example.com',
    password: 'senha-segura'
  }, () => client);

  assertEq(result, { id: 'user-1', email: 'jose@example.com', created: false });
  assertEq(calls[1], {
    name: 'updateUserById',
    value: {
      id: 'user-1',
      value: {
        password: 'senha-segura',
        user_metadata: { origem: 'manual', nome: 'José da Silva' }
      }
    }
  });
  assertTrue(!calls.some((call) => call.name === 'createUser'));
  assertTrue(!calls.some((call) => call.name === 'deleteUser'));
});

test('assistente preserva a senha ao reutilizar usuário com senha em branco', async () => {
  const { client, calls } = fakeClient({ existing: true });
  const result = await createInitialAdmin({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'secret',
    name: 'José',
    email: 'jose@example.com',
    password: ''
  }, () => client);
  assertEq(result.created, false);
  assertEq(calls[1], {
    name: 'updateUserById',
    value: {
      id: 'user-1',
      value: { user_metadata: { origem: 'manual', nome: 'José' } }
    }
  });
});

test('assistente remove a conta parcial se a promoção falhar', async () => {
  const { client, calls } = fakeClient({ profileError: 'banco recusou' });
  let failed = false;
  try {
    await createInitialAdmin({
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'secret',
      name: 'José',
      email: 'jose@example.com',
      password: 'senha-segura'
    }, () => client);
  } catch (error) {
    failed = String(error).includes('não pôde ser promovida');
  }
  assertTrue(failed);
  assertTrue(calls.some((call) => call.name === 'deleteUser'));
});

test('assistente recusa senha inicial curta antes de chamar o Supabase', async () => {
  const { client, calls } = fakeClient();
  let failed = false;
  try {
    await createInitialAdmin({
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'secret',
      name: 'José',
      email: 'jose@example.com',
      password: '123'
    }, () => client);
  } catch (error) {
    failed = String(error).includes('pelo menos 8');
  }
  assertTrue(failed);
  assertEq(calls.length, 0);
});
