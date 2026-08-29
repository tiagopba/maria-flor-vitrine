-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Amplia a lista de event_type permitida em analytics_events para incluir
-- dois eventos novos do fluxo guiado de seleção na página de produto
-- ("Quero essa peça" → tamanho → seleção → vendedora). Puramente aditiva:
-- nenhuma linha existente é alterada ou perdida, só passa a aceitar dois
-- valores novos.
--
-- Sem essa migration, o app já funciona normalmente (o registro desses
-- dois eventos falha e fica só no log, sem bloquear nada — mesmo padrão
-- de degradação usado em toda gravação de analytics_events deste
-- projeto) — só essas duas métricas específicas ficam sem dado até
-- aplicar:
--   - quantas clientes tocaram em "Quero essa peça" (PRODUCT_FLOW_STARTED)
--   - quantas tocaram em "Ver mais peças" (PRODUCT_FLOW_SEE_MORE_CLICK)
-- As outras três métricas pedidas já são medíveis com eventos existentes:
--   - "selecionaram tamanho" → FAVORITE_ADDED (metadata.size, source
--     "product_page")
--   - "finalizaram com vendedora" → FAVORITES_WHATSAPP_CLICK
--   - "média de produtos por seleção" → metadata.available_products_count
--     em FAVORITES_WHATSAPP_CLICK
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
    'FAVORITES_VIEW', 'FAVORITES_WHATSAPP_CLICK',
    'SELECTION_CREATED', 'SELECTION_VIEWED',
    'PRODUCT_FLOW_STARTED', 'PRODUCT_FLOW_SEE_MORE_CLICK'
  ));
