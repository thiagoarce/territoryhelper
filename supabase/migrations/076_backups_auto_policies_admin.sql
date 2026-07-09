-- 076 (W6): policies de Storage no bucket `backups-auto` pro ADMIN
-- autenticado. O redesenho do backup (client-orchestrated) precisa que
-- o BROWSER do admin liste/suba/apague snapshots direto no Storage —
-- o modelo antigo (Worker gera via waitUntil, service role acessa)
-- morria no limite de CPU do Workers free (~10ms POR INVOCAÇÃO,
-- cumulativo — o JSON.stringify de MBs estourava e o waitUntil morria
-- silencioso; ver docs/specs-workers-offline.md).
--
-- O bucket continua privado (public=false, migration 074) — anon não
-- enxerga nada; só admin autenticado passa nas policies.

drop policy if exists backups_auto_admin_select on storage.objects;
create policy backups_auto_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'backups-auto' and is_admin());

drop policy if exists backups_auto_admin_insert on storage.objects;
create policy backups_auto_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'backups-auto' and is_admin());

drop policy if exists backups_auto_admin_delete on storage.objects;
create policy backups_auto_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'backups-auto' and is_admin());
