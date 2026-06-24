// Tipos compartilhados — espelha o schema do Postgres pra ter type-safety
// nas queries do Supabase. Quando o schema mudar, atualize aqui também
// (ou gere automatic com `supabase gen types`).

export type Role = 'admin' | 'dirigente' | 'publicador';

export interface Profile {
  id: string; // uuid (auth.users.id)
  nome: string;
  role: Role;
  ativo: boolean;
  criado_em: string;
}

export interface UsuarioComEmail extends Profile {
  email: string;
}
