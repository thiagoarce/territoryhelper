-- ============================================================================
-- 046_notificacoes.sql — TP completo, incremento PUSH-A: notificações
-- in-app + Web Push.
--
-- `notificacoes` é a fonte da verdade (o sino do header lê daqui — fallback
-- universal, funciona sem permissão de push). `push_subscriptions` guarda
-- as inscrições de Web Push por dispositivo.
--
-- Envio (ver src/lib/server/push.ts no incremento): push "tickle" SEM
-- payload — o SW recebe o push vazio e faz fetch autenticado em
-- /api/notificacoes pra buscar o conteúdo. Isso evita a criptografia
-- aes128gcm; só resta assinar o VAPID JWT (ES256) no Worker. As
-- subscriptions são lidas no server via supabaseAdmin (service role).
-- ============================================================================

create table if not exists notificacoes (
  id bigserial primary key,
  publicador_id uuid not null references profiles(id) on delete cascade,
  titulo text not null,
  corpo text,
  url text,                           -- deep link ("/publicador/arranjo")
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists notificacoes_pub_idx on notificacoes(publicador_id, criado_em desc);
-- Badge de não-lidas: índice parcial das pendentes.
create index if not exists notificacoes_nao_lidas_idx on notificacoes(publicador_id)
  where lida_em is null;

create table if not exists push_subscriptions (
  id bigserial primary key,
  publicador_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  falhas int not null default 0,      -- POSTs falhados seguidos; poda em N
  criado_em timestamptz not null default now()
);
create index if not exists push_subscriptions_pub_idx on push_subscriptions(publicador_id);

alter table notificacoes enable row level security;
alter table push_subscriptions enable row level security;

-- Cada um vê e marca como lida SÓ as suas. Notificações cross-user
-- (designação → outros publicadores) são criadas no server via
-- supabaseAdmin, que bypassa RLS — por isso o insert por sessão só precisa
-- cobrir o caso admin/servo criando manualmente.
drop policy if exists notificacoes_select on notificacoes;
create policy notificacoes_select on notificacoes for select using (publicador_id = auth.uid());
drop policy if exists notificacoes_update on notificacoes;
create policy notificacoes_update on notificacoes for update
  using (publicador_id = auth.uid()) with check (publicador_id = auth.uid());
drop policy if exists notificacoes_insert on notificacoes;
create policy notificacoes_insert on notificacoes for insert
  with check (is_admin() or is_servo_pub());

-- Subscription: cada dispositivo registra/remove a sua. Leitura de
-- subscription alheia (pra enviar push) só via service role no server.
drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions for select using (publicador_id = auth.uid());
drop policy if exists push_subscriptions_insert on push_subscriptions;
create policy push_subscriptions_insert on push_subscriptions for insert with check (publicador_id = auth.uid());
drop policy if exists push_subscriptions_delete on push_subscriptions;
create policy push_subscriptions_delete on push_subscriptions for delete using (publicador_id = auth.uid());
