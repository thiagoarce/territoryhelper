import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface InitialAdminInput {
  supabaseUrl: string;
  serviceRoleKey: string;
  name: string;
  email: string;
  password: string;
}

export interface InitialAdminResult {
  id: string;
  email: string;
}

export async function createInitialAdmin(
  input: InitialAdminInput,
  clientFactory: (url: string, key: string) => SupabaseClient = (url, key) =>
    createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
): Promise<InitialAdminResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new Error("Informe o nome do primeiro administrador.");
  if (!/^\S+@\S+\.\S+$/.test(email))
    throw new Error("Informe um email válido para o administrador.");
  if (input.password.length < 8)
    throw new Error("A senha do administrador precisa ter pelo menos 8 caracteres.");
  if (!input.supabaseUrl.trim() || !input.serviceRoleKey.trim())
    throw new Error("Conecte o Supabase antes de criar o administrador.");

  const client = clientFactory(input.supabaseUrl, input.serviceRoleKey);
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { nome: name },
  });
  if (error || !data.user)
    throw new Error(
      `Não foi possível criar o administrador: ${error?.message ?? "resposta inválida do Supabase"}`,
    );

  const { error: profileError } = await client.from("profiles").upsert({
    id: data.user.id,
    nome: name,
    role: "admin",
    ativo: true,
  });
  if (profileError) {
    // Evita deixar uma conta parcialmente criada que impediria a repetição
    // simples do assistente com o mesmo email.
    await client.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw new Error(
      `A conta foi criada, mas não pôde ser promovida: ${profileError.message}`,
    );
  }
  return { id: data.user.id, email };
}
