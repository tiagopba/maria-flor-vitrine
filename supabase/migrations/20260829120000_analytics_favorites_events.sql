-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Amplia a lista de event_type permitida em analytics_events para incluir
-- os dois novos eventos do módulo Favoritos (FAVORITE_ADDED e
-- FAVORITE_REMOVED já existiam desde a fundação do projeto e não são
-- afetados). Puramente aditiva: nenhuma linha existente é alterada ou
-- perdida, só passa a aceitar dois valores novos.
--
-- O nome da constraint abaixo (analytics_events_event_type_check) segue a
-- convenção padrão do Postgres para uma CHECK inline sem nome explícito
-- num único campo — confirme com \d analytics_events (ou o Table Editor
-- do Supabase) antes de aplicar, caso o nome real seja diferente.
-- ============================================================================

alter table analytics_events
  drop constraint analytics_events_event_type_check;

alter table analytics_events
  add constraint analytics_events_event_type_check check (event_type in (
    'PRODUCT_VIEW', 'CATEGORY_VIEW', 'SEARCH', 'SIZE_SELECTED',
    'FAVORITE_ADDED', 'FAVORITE_REMOVED', 'WHATSAPP_CLICK', 'PROVADOR_VIEW',
    'LOOK_WHATSAPP_CLICK', 'COLLECTION_VIEW', 'LEAD_SUBMITTED', 'SHARE_PRODUCT',
    'FAVORITES_VIEW', 'FAVORITES_WHATSAPP_CLICK'
  ));
