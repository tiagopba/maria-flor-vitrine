-- ============================================================================
-- Storage: bucket público de imagens de produtos
-- Upload/gerenciamento só acontece via service role (server), leitura é pública.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'products',
  'products',
  true,
  5242880, -- 5MB por arquivo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "products_bucket_public_read"
  on storage.objects for select
  using (bucket_id = 'products');

-- Nenhuma policy de insert/update/delete para anon/authenticated:
-- uploads acontecem via service role nas rotas de API (bypassa RLS).
