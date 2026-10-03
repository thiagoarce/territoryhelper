do $$ begin
  create type public.role_usuario as enum ('admin', 'dirigente', 'publicador');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  role public.role_usuario not null default 'publicador',
  ativo boolean not null default true,
  servo_publicacoes boolean not null default false,
  pref_basemap text not null default 'positron' check (pref_basemap in ('positron', 'liberty', 'bright')),
  tp_aprovado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_ativo_idx on public.profiles(ativo);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.auth_role() returns public.role_usuario
language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid() and ativo = true;
$$;

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce(public.auth_role() = 'admin', false);
$$;

create or replace function public.is_dirigente_or_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce(public.auth_role() in ('admin', 'dirigente'), false);
$$;

create or replace function public.bump_atualizado_em() returns trigger
language plpgsql set search_path = public as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create or replace function public.profiles_guard_sensitive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if old.id <> auth.uid() then raise exception 'PROFILE_NOT_OWNED'; end if;
  if new.role is distinct from old.role
     or new.ativo is distinct from old.ativo
     or new.servo_publicacoes is distinct from old.servo_publicacoes
     or new.tp_aprovado is distinct from old.tp_aprovado then
    raise exception 'PROFILE_PRIVILEGE_CHANGE_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_sensitive on public.profiles;
create trigger profiles_guard_sensitive before update on public.profiles
for each row execute function public.profiles_guard_sensitive();

drop trigger if exists bump_profiles on public.profiles;
create trigger bump_profiles before update on public.profiles
for each row execute function public.bump_atualizado_em();
