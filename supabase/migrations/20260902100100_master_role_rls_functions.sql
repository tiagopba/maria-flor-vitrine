-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário.
-- Aplicar SOMENTE depois de 20260902100000_add_master_role.sql (esta
-- migration usa o valor 'master' do enum `user_role`, que só existe depois
-- daquela ter sido aplicada — daí os dois arquivos separados).
--
-- Atualiza is_admin() e is_catalog_editor_or_admin() pra reconhecer
-- 'master' também. Essas duas funções são a base de TODA a RLS
-- administrativa do projeto (products, categories, colors, sizes,
-- sellers, site_settings, product_slug_redirects, provador_look_products,
-- collection_products, analytics_events, lead_interests, etc.) — helper de
-- amanhã amanhã só precisa mexer aqui pra "master" herdar automaticamente
-- tudo que "admin"/"catalog_editor" já têm, sem tocar em cada policy uma
-- por uma.
--
-- Puramente aditivo: só AMPLIA quem passa em cada função (adiciona
-- 'master' ao `role in (...)`) — "admin" e "catalog_editor" continuam
-- exatamente com o mesmo acesso que já tinham, nada é removido.
-- ============================================================================

create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'master')
  );
$$ language sql stable security definer set search_path = public;

create or replace function is_catalog_editor_or_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'catalog_editor', 'master')
  );
$$ language sql stable security definer set search_path = public;
