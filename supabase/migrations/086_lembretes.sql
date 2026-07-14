-- 086: suporte pros lembretes automáticos de prazo (aprimoramento
-- recomendado). O adapter-cloudflare gera _worker.js do zero a cada
-- build (files/worker.js do pacote só exporta `fetch`, sem `scheduled`)
-- — não dá pra registrar um Cloudflare Cron Trigger de verdade sem
-- hackear o build gerado, algo frágil e fora do espírito do projeto.
-- Em vez disso: "cron preguiçoso" — a checagem diária roda dentro de um
-- request HTTP normal (hooks.server.ts, só em rotas /admin/*), usando
-- job_execucoes como trava de "já rodou hoje" pra não repetir a cada
-- request. Zero infra nova, zero custo além do request que já ia
-- acontecer mesmo.

-- Trava de execução única por dia (upsert ANTES de rodar a lógica —
-- corta a corrida de dois requests simultâneos disparando o job 2x).
create table if not exists job_execucoes (
  nome text primary key,
  executado_em date not null
);
alter table job_execucoes enable row level security;
drop policy if exists job_execucoes_service_only on job_execucoes;
create policy job_execucoes_service_only on job_execucoes for all to service_role using (true) with check (true);

-- Dedup de lembrete: designação só é lembrada UMA VEZ (chave=id, nunca
-- reenviado mesmo que o prazo continue chegando); território parado é
-- relembrado no máximo 1x/30 dias (nagging periódico, não silêncio
-- eterno nem spam diário).
create table if not exists lembretes_enviados (
  tipo text not null,
  chave text not null,
  enviado_em timestamptz not null default now(),
  primary key (tipo, chave)
);
alter table lembretes_enviados enable row level security;
drop policy if exists lembretes_enviados_service_only on lembretes_enviados;
create policy lembretes_enviados_service_only on lembretes_enviados for all to service_role using (true) with check (true);
