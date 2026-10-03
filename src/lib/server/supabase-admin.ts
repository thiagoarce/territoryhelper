// Client com SERVICE_ROLE — só pode ser importado de arquivos .server.ts
// ou hooks.server.ts. NUNCA exponha no client (bypassa todas as RLS).
//
// De onde vem a chave — os DOIS caminhos precisam continuar valendo:
//   - runtime (`$env/dynamic`): instalações novas, onde o Installer manda a
//     chave como secret do Worker (`wrangler secret put`);
//   - build (`$env/static`, via import de namespace — chave ausente no
//     build vira `undefined` em vez de quebrar o build): a instância
//     original, cujo deploy pelo Cloudflare Builds sempre leu a chave em
//     tempo de build.
// E NUNCA lançar no import: hooks.server.ts → lembretes.ts → este arquivo,
// então um throw aqui derruba o app INTEIRO, não só as telas que usam o
// client administrativo. A falha fica para o primeiro uso de verdade.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env as privateEnv } from '$env/dynamic/private';
import * as staticPrivate from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

function chaveAdministrativa(): string | undefined {
  return (
    privateEnv.SUPABASE_SERVICE_ROLE_KEY ||
    (staticPrivate as Record<string, string | undefined>).SUPABASE_SERVICE_ROLE_KEY ||
    undefined
  );
}

let client: SupabaseClient | null = null;

function obterClient(): SupabaseClient {
  if (client) return client;
  const chave = chaveAdministrativa();
  if (!chave) {
    throw new Error('A chave administrativa do Supabase não está configurada neste servidor.');
  }
  client = createClient(PUBLIC_SUPABASE_URL, chave, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return client;
}

// Mesmo objeto de sempre pra quem importa (`supabaseAdmin.from(...)`),
// criado só no primeiro acesso.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_alvo, prop) {
    const c = obterClient() as any;
    const v = c[prop];
    return typeof v === 'function' ? v.bind(c) : v;
  }
});
