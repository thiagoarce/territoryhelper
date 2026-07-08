-- 074: bucket de Storage pra snapshots automáticos de backup (U6).
-- Alternativa gratuita ao Point-in-Time-Recovery pago do Supabase: o
-- server gera um snapshot JSON (mesmo formato do export manual) sempre
-- que um admin abre /admin/dev/backup e o último snapshot salvo tem
-- mais de ~20h — sem Cron Trigger (o adapter Cloudflare usado neste
-- projeto só suporta handler de fetch, não scheduled/cron; forçar isso
-- exigiria um hack frágil no build do Worker, já causou 1 incidente de
-- deploy nesta sessão mexendo em config parecida — decisão do usuário:
-- não vale o risco, snapshot-ao-acessar é aceitável).
--
-- Privado (não-público) — só o service role (supabaseAdmin, mesma
-- credencial já usada pelo export/restore) lê/escreve. Sem policy de
-- authenticated: nem admin acessa os arquivos direto pelo client
-- anon/authenticated, só via rota server-side (que já é admin-only).
insert into storage.buckets (id, name, public)
values ('backups-auto', 'backups-auto', false)
on conflict (id) do nothing;
