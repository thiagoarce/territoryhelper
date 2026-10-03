-- Buckets necessários ao núcleo. Backups permanecem privados; fotos podem ser lidas
-- publicamente quando a aplicação usa a URL pública, mas só autenticados escrevem.
insert into storage.buckets (id, name, public)
values
  ('fotos-locais', 'fotos-locais', true),
  ('arranjos', 'arranjos', false),
  ('backups', 'backups', false),
  ('mapa-offline', 'mapa-offline', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "fotos_locais_operacional_insert" on storage.objects;
create policy "fotos_locais_operacional_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-locais');
drop policy if exists "fotos_locais_operacional_update" on storage.objects;
create policy "fotos_locais_operacional_update" on storage.objects for update to authenticated
  using (bucket_id = 'fotos-locais') with check (bucket_id = 'fotos-locais');
drop policy if exists "fotos_locais_operacional_delete" on storage.objects;
create policy "fotos_locais_operacional_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-locais');

drop policy if exists "arranjos_read_authenticated" on storage.objects;
create policy "arranjos_read_authenticated" on storage.objects for select to authenticated
  using (bucket_id = 'arranjos');
drop policy if exists "arranjos_manage_global" on storage.objects;
create policy "arranjos_manage_global" on storage.objects for all to authenticated
  using (bucket_id = 'arranjos' and public.is_dirigente_or_admin())
  with check (bucket_id = 'arranjos' and public.is_dirigente_or_admin());

drop policy if exists "backups_admin" on storage.objects;
create policy "backups_admin" on storage.objects for all to authenticated
  using (bucket_id = 'backups' and public.is_admin())
  with check (bucket_id = 'backups' and public.is_admin());

drop policy if exists "mapa_offline_admin_write" on storage.objects;
create policy "mapa_offline_admin_write" on storage.objects for all to authenticated
  using (bucket_id = 'mapa-offline' and public.is_admin())
  with check (bucket_id = 'mapa-offline' and public.is_admin());
