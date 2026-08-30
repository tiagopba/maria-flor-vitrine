-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Bucket de Storage dedicado pra imagens institucionais (hoje: só a foto
-- da fachada da loja, usada em /quem-somos e editável em
-- /admin/configuracoes). Mesmo padrão já usado pelos buckets 'products' e
-- 'categories': público pra leitura, upload direto do navegador pro
-- Storage (nunca passa pelo body de uma Server Action/Vercel, que recusa
-- requisições > 4.5MB).
--
-- Diferença importante em relação a 'products'/'categories': lá a policy
-- de escrita usa is_catalog_editor_or_admin() — aqui usa só is_admin(),
-- porque só ADMIN pode editar Configurações do Site (mesma regra da
-- policy "site_settings_admin_all" já existente).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'institutional',
  'institutional',
  true,
  5242880, -- 5MB por arquivo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "institutional_bucket_public_read"
  on storage.objects for select
  using (bucket_id = 'institutional');

create policy "institutional_bucket_admin_insert" on storage.objects
  for insert
  with check (bucket_id = 'institutional' and is_admin());

create policy "institutional_bucket_admin_update" on storage.objects
  for update
  using (bucket_id = 'institutional' and is_admin());

create policy "institutional_bucket_admin_delete" on storage.objects
  for delete
  using (bucket_id = 'institutional' and is_admin());
