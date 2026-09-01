-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: qualquer migration passa por aprovação antes de
-- rodar contra o banco compartilhado entre Preview e Production).
--
-- Suporte ao módulo de instrumentação/dashboard MVP. Puramente aditivo:
-- nenhuma linha existente é alterada ou perdida.
--
-- 1) Amplia a lista de event_type permitida em analytics_events para
--    incluir dois eventos novos:
--      PAGE_VIEW            — visualização genérica de qualquer página
--                              pública (card "Visualizações da vitrine" do
--                              dashboard); complementa PRODUCT_VIEW/
--                              CATEGORY_VIEW, que continuam medindo só as
--                              páginas de produto/categoria especificamente.
--      OFFER_LEAD_CONFIRMED — e-mail confirmado via OTP no cadastro do
--                              Grupo de Ofertas (distinto de
--                              OFFER_LEAD_SUBMITTED, que já existe e marca
--                              só o envio do formulário, antes da
--                              confirmação).
--
-- 2) Adiciona a coluna `device_type` (nullable, texto livre — "mobile"/
--    "tablet"/"desktop") para segmentar o dashboard por dispositivo.
--    Linhas antigas ficam com device_type = NULL, o que é esperado e
--    tratado como "desconhecido" em qualquer agregação.
--
-- O nome da constraint abaixo (analytics_events_event_type_check) segue a
-- convenção padrão do Postgres — confirme com \d analytics_events antes de
-- aplicar, caso o nome real seja diferente.
-- ============================================================================

alter table analytics_events
  add column if not exists device_type text;

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
    'OFFERS_PAGE_VIEW', 'OFFER_LEAD_SUBMITTED', 'OFFERS_GROUP_CLICK', 'STORE_DIRECTIONS_CLICK',
    'PAGE_VIEW', 'OFFER_LEAD_CONFIRMED'
  ));

-- Índice pra acelerar as agregações por período do dashboard (toda query
-- filtra por created_at, muitas também por event_type).
create index if not exists analytics_events_created_at_event_type_idx
  on analytics_events (created_at, event_type);
