-- Recursos transversais usados pelo shell da aplicação e pelos fluxos públicos.
-- Eles fazem parte do piloto mesmo com campanhas, publicações e TP desativados.

create table if not exists public.territorio_tokens (
  token uuid primary key default gen_random_uuid(),
  designacao_id bigint references public.designacoes(id) on delete cascade,
  arranjo_id bigint references public.arranjos(id) on delete cascade,
  criado_por uuid references public.profiles(id) on delete set null,
  criada_em timestamptz not null default now(),
  expira_em timestamptz,
  check (num_nonnulls(designacao_id, arranjo_id) = 1)
);

create table if not exists public.cartas_tokens (
  token uuid primary key default gen_random_uuid(),
  local_id bigint not null references public.locais(id) on delete cascade,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.profiles(id) on delete set null,
  expira_em timestamptz,
  qtd_acessos integer not null default 0
);
create index if not exists cartas_tokens_local_idx on public.cartas_tokens(local_id);

create table if not exists public.notificacoes (
  id bigserial primary key,
  publicador_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  corpo text,
  url text,
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists notificacoes_pub_idx on public.notificacoes(publicador_id, criado_em desc);
create index if not exists notificacoes_nao_lidas_idx on public.notificacoes(publicador_id) where lida_em is null;

create table if not exists public.push_subscriptions (
  id bigserial primary key,
  publicador_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  falhas integer not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists push_subscriptions_pub_idx on public.push_subscriptions(publicador_id);

create table if not exists public.erros_client (
  id bigserial primary key,
  publicador_id uuid not null references public.profiles(id) on delete cascade,
  mensagem text not null,
  stack text,
  url text,
  user_agent text,
  criado_em timestamptz not null default now(),
  constraint erros_client_tamanho check (
    length(mensagem) <= 2000
    and (stack is null or length(stack) <= 4000)
    and (url is null or length(url) <= 1000)
    and (user_agent is null or length(user_agent) <= 500)
  )
);
create index if not exists erros_client_criado_idx on public.erros_client(criado_em desc);

create table if not exists public.job_execucoes (
  nome text primary key,
  executado_em date not null
);

create table if not exists public.lembretes_enviados (
  tipo text not null,
  chave text not null,
  enviado_em timestamptz not null default now(),
  primary key (tipo, chave)
);
