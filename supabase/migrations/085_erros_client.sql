-- 085: telemetria de erros do CLIENT (aprimoramento recomendado).
--
-- Hoje um erro JS no aparelho de um publicador some silenciosamente —
-- só aparece se ele reportar de viva voz (foi assim que o bug do mapa
-- cinza apareceu). Uma tabela simples de "erros vistos" + um catch
-- global no root layout dá visibilidade sem precisar de serviço pago.
create table if not exists erros_client (
  id bigserial primary key,
  publicador_id uuid references profiles(id) on delete set null,
  mensagem text not null,
  stack text,
  url text,
  user_agent text,
  criado_em timestamptz not null default now()
);
create index if not exists erros_client_criado_idx on erros_client(criado_em desc);

alter table erros_client enable row level security;

-- Qualquer autenticado pode REPORTAR o próprio erro (insert), mas só
-- admin lê a lista (é debug interno, não dado do publicador).
drop policy if exists erros_client_insert on erros_client;
create policy erros_client_insert on erros_client for insert to authenticated
  with check (publicador_id = auth.uid() or publicador_id is null);

drop policy if exists erros_client_select on erros_client;
create policy erros_client_select on erros_client for select to authenticated using (is_admin());

drop policy if exists erros_client_delete on erros_client;
create policy erros_client_delete on erros_client for delete to authenticated using (is_admin());
