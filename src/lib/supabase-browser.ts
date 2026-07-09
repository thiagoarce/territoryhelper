// W2: client Supabase do BROWSER — singleton, mesma sessão (cookies) que
// o locals.supabase do server usa. Permissão idêntica: RLS decide tudo.
// Usado pelos loads universais (+page.ts) da rodada Workers/Offline
// (leituras direto browser→Supabase, sem passar pelo Worker) e pelo
// realtime da tela de quadra.
//
// NUNCA importar em módulo de $lib/server — é o caminho contrário.
import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}
