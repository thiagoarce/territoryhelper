// Client com SERVICE_ROLE — só pode ser importado de arquivos .server.ts
// ou hooks.server.ts. NUNCA exponha no client (bypassa todas as RLS).
import { createClient } from "@supabase/supabase-js";
import { env as privateEnv } from "$env/dynamic/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";

const adminKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!adminKey) {
  throw new Error(
    "A chave administrativa do Supabase não está configurada neste servidor.",
  );
}

export const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, adminKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
