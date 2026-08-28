-- ============================================================================
-- Storage: bucket público de imagens de capa de categoria
-- Mesmo padrão do bucket 'products': leitura pública, upload só via service role.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'categories',
  'categories',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "categories_bucket_public_read"
  on storage.objects for select
  using (bucket_id = 'categories');

-- ============================================================================
-- Seed: categorias iniciais sugeridas (dados administráveis, não hardcode no
-- frontend). idempotente via ON CONFLICT no slug — seguro rodar mais de uma vez.
-- ============================================================================

insert into categories (name, slug, position, active) values
  ('Novidades', 'novidades', 0, true),
  ('Jeans', 'jeans', 1, true),
  ('Calças', 'calcas', 2, true),
  ('Blusas', 'blusas', 3, true),
  ('T-shirts', 't-shirts', 4, true),
  ('Conjuntos', 'conjuntos', 5, true),
  ('Vestidos', 'vestidos', 6, true),
  ('Saias', 'saias', 7, true),
  ('Shorts', 'shorts', 8, true),
  ('Acessórios', 'acessorios', 9, true)
on conflict (slug) do nothing;
