-- ============================================================================
-- Storage: permite que admin/catalog_editor façam upload/gestão de imagens
-- diretamente com a própria sessão autenticada (client anon key + RLS),
-- em vez de depender de service_role para essa operação de rotina.
--
-- Antes: só existia policy de leitura pública; upload/remoção só
-- funcionavam via service_role (que ignora RLS). Isso concentrava
-- confiança demais numa chave que não deveria ser necessária para uma
-- escrita de rotina já protegida por requireAdmin() na aplicação.
-- ============================================================================

create policy "products_bucket_admin_insert" on storage.objects
  for insert
  with check (bucket_id = 'products' and is_catalog_editor_or_admin());

create policy "products_bucket_admin_update" on storage.objects
  for update
  using (bucket_id = 'products' and is_catalog_editor_or_admin());

create policy "products_bucket_admin_delete" on storage.objects
  for delete
  using (bucket_id = 'products' and is_catalog_editor_or_admin());

create policy "categories_bucket_admin_insert" on storage.objects
  for insert
  with check (bucket_id = 'categories' and is_catalog_editor_or_admin());

create policy "categories_bucket_admin_update" on storage.objects
  for update
  using (bucket_id = 'categories' and is_catalog_editor_or_admin());

create policy "categories_bucket_admin_delete" on storage.objects
  for delete
  using (bucket_id = 'categories' and is_catalog_editor_or_admin());
