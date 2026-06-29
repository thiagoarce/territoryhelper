-- ============================================================================
-- 015_storage_fotos.sql
-- Bucket 'fotos-locais' pra fotos dos prédios/locais.
-- Público pra leitura, write só authenticated.
-- ============================================================================

-- IMPORTANTE: Storage não tem CREATE OR REPLACE pra bucket. Se já existe, ignora.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-locais', 'fotos-locais', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Policy: anyone read (bucket é public, mas garantia extra)
create policy "fotos_locais_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'fotos-locais');

-- Authenticated pode upload
create policy "fotos_locais_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-locais');

-- Authenticated pode delete (admin via service_role pode tudo)
create policy "fotos_locais_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-locais');
