-- 089: saneamento do alerta "rls_disabled_in_public" do Supabase advisor
-- (e-mail "Action required: security vulnerabilities detected") + achados
-- baixos da revisão de segurança final.
--
-- Contexto: TODAS as 55 tabelas criadas pelas migrations deste repo já
-- habilitam RLS (varredura confirmou). A tabela sem RLS do alerta quase
-- certamente é a `spatial_ref_sys` do PostGIS — a extensão cria essa
-- tabela de REFERÊNCIA (catálogo público de sistemas de coordenadas,
-- nenhum dado da congregação) no schema public, sem RLS, e sem que o
-- papel `postgres` tenha ownership pra mudar isso. A doc oficial do
-- Supabase trata esse caso como exceção conhecida e segura de ignorar.
--
-- Este script cobre os dois cenários sem precisar saber o nome da tabela:
-- habilita RLS em QUALQUER tabela do public que esteja sem (pega tabela
-- nossa criada fora de migration, se existir) e ignora com aviso a que
-- não for nossa (ownership da extensão). Habilitar RLS sem policy vira
-- deny-all pra anon/authenticated — pra tabela esquecida, negar tudo é
-- o estado seguro até alguém criar as policies certas.
do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables
    where schemaname = 'public' and rowsecurity = false
  loop
    begin
      execute format('alter table public.%I enable row level security', r.tablename);
      raise notice 'RLS habilitada em public.%', r.tablename;
    exception when insufficient_privilege then
      raise notice 'public.% pertence a extensão (sem ownership) — exceção conhecida, ignorando', r.tablename;
    end;
  end loop;
end $$;

-- Achado (revisão de segurança): o INSERT de erros_client aceitava
-- publicador_id NULL — nunca permitiu forjar autoria de TERCEIRO, mas
-- deixava inserir linha sem autoria nenhuma. O client legítimo sempre
-- manda o próprio id; fecha a brecha.
drop policy if exists erros_client_insert on erros_client;
create policy erros_client_insert on erros_client for insert to authenticated
  with check (publicador_id = auth.uid());

-- Achado (revisão de segurança): os limites de tamanho de erros_client
-- eram só client-side (slice no JS) — um autenticado podia inserir
-- payloads gigantes direto no PostgREST e comer os 500MB do free.
-- NOT VALID: só valida escritas novas (não trava se já houver linha
-- fora do limite).
alter table erros_client drop constraint if exists erros_client_tamanho;
alter table erros_client add constraint erros_client_tamanho check (
  length(mensagem) <= 2000
  and (stack is null or length(stack) <= 4000)
  and (url is null or length(url) <= 1000)
  and (user_agent is null or length(user_agent) <= 500)
) not valid;
