-- ============================================================================
-- 001_profiles_and_auth.sql
-- Schema base de autenticação: profile estendendo auth.users com role.
-- ============================================================================

-- Enum de papéis
create type role_usuario as enum ('admin', 'dirigente', 'publicador');

-- Profile complementa auth.users (gerenciado pelo Supabase) com info do app
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  role role_usuario not null default 'publicador',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index profiles_role_idx on profiles(role);
create index profiles_ativo_idx on profiles(ativo);

-- Trigger: ao criar auth.users, cria profile correspondente automaticamente.
-- Pega o `nome` do user_metadata.nome se fornecido.
create function handle_new_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ====================
-- RLS — Row Level Security
-- ====================
alter table profiles enable row level security;

-- Todo usuário autenticado pode LER profiles (pra exibir nome em listas etc).
-- Sensitive fields (role, ativo) são read-only via API normal — só admin/service_role pode mudar.
create policy "profiles_read_authenticated" on profiles
  for select to authenticated using (true);

-- Próprio usuário pode atualizar SEU próprio nome (não role/ativo).
create policy "profiles_update_self_nome" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()) and ativo = (select ativo from profiles where id = auth.uid()));

-- Admins podem atualizar qualquer profile.
create policy "profiles_admin_all" on profiles
  for all to authenticated
  using ((select role from profiles where id = auth.uid()) = 'admin')
  with check ((select role from profiles where id = auth.uid()) = 'admin');

-- Helper function — útil em policies de outras tabelas.
create function auth_role() returns role_usuario
  language sql security definer stable
as $$
  select role from profiles where id = auth.uid();
$$;

create function is_admin() returns boolean
  language sql security definer stable
as $$
  select auth_role() = 'admin';
$$;
