-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Amplia a lista de event_type permitida em analytics_events para incluir
-- quatro eventos novos do módulo institucional. Puramente aditiva: mantém
-- todos os 18 valores já existentes e acrescenta só os 4 novos.
--
-- Novos eventos:
--   OFFERS_PAGE_VIEW      — abertura de /ofertas
--   OFFER_LEAD_SUBMITTED  — cadastro no Grupo de Ofertas enviado com sucesso
--                           (distinto do LEAD_SUBMITTED genérico já
--                           existente desde o schema inicial, nunca usado
--                           por nenhum fluxo real até agora — este é
--                           específico do formulário de Ofertas, pra poder
--                           medir essa origem separadamente no futuro)
--   OFFERS_GROUP_CLICK    — clique em "Entrar no grupo de ofertas"
--   STORE_DIRECTIONS_CLICK — clique em "Abrir no Google Maps" ou "Abrir no
--                           Waze" em /como-chegar (metadata.provider
--                           distingue qual dos dois)
--
-- O nome da constraint abaixo (analytics_events_event_type_check) segue a
-- convenção padrão do Postgres — confirme com \d analytics_events antes de
-- aplicar, caso o nome real seja diferente.
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
    'PRODUCT_FLOW_STARTED', 'PRODUCT_FLOW_SEE_MORE_CLICK',
    'OFFERS_PAGE_VIEW', 'OFFER_LEAD_SUBMITTED', 'OFFERS_GROUP_CLICK', 'STORE_DIRECTIONS_CLICK'
  ));
