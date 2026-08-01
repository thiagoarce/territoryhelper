-- Metadados da instalação. Não contém dados da congregação original.
create table if not exists public.schema_versions (
  version text primary key,
  description text not null,
  installed_at timestamptz not null default now()
);

create table if not exists public.installation_config (
  singleton boolean primary key default true check (singleton),
  congregation_name text not null,
  timezone text not null default 'America/Sao_Paulo',
  operation_mode text not null default 'territorial' check (operation_mode in ('territorial', 'language')),
  modules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  package_version text not null,
  manifest_hash text not null unique,
  input_hashes jsonb not null,
  status text not null default 'prepared' check (status in ('prepared', 'publishing', 'published', 'failed')),
  report jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

insert into public.schema_versions(version, description)
values ('1.0.0', 'Baseline limpa para novas instalações')
on conflict (version) do update set description = excluded.description;
