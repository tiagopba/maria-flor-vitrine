-- ============================================================================
-- Categorias: campos opcionais de descrição e imagem de capa
-- (tabela `categories` já existia desde a migration inicial — só estendendo)
-- ============================================================================

alter table categories
  add column if not exists description text,
  add column if not exists cover_image text;
