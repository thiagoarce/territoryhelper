import { createInitialAdmin } from '$lib/installer/initial-admin';
import { assertEq, assertTrue, test } from './harness';

function fakeClient(options: { profileError?: string } = {}) {
  const calls: Array<{ name: string; value: unknown }> = [];
  const client: any = {
    auth: {
      admin: {
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

  assertEq(result, { id: 'user-1', email: 'jose@example.com' });
  assertEq(calls[0], {
    name: 'createUser',
    value: {
      email: 'jose@example.com',
      password: 'senha-segura',
      email_confirm: true,
      user_metadata: { nome: 'José da Silva' }
    }
  });
  assertEq(calls[1], {
    name: 'upsert:profiles',
    value: { id: 'user-1', nome: 'José da Silva', role: 'admin', ativo: true }
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
