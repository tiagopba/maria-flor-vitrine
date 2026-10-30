-- ============================================================================
-- EDITAR DADOS DA VENDA (pós-aprovação) — nova ação de auditoria em
-- fulfillment_audit_logs. Migration ADITIVA.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Escopo reduzido de propósito: só a constraint de ação de
-- fulfillment_audit_logs. A tabela de auditoria das intakes (pré-aprovação)
-- não é tocada aqui — EDITAR VENDA reaproveita uma ação que já faz parte do
-- estado esperado de Production por ajustes anteriores do projeto; nenhuma
-- reconstrução dessa outra constraint nesta frente.
--
-- Lista atual confirmada no histórico deste repositório (as únicas migrations
-- que já tocaram fulfillment_audit_logs_action_check, em ordem:
-- 20261005220000_fulfillment_post_sale_audit_actions.sql,
-- 20261006100000_fulfillment_intake_created_audit.sql,
-- 20261015100000_fulfillment_tracking_pending.sql — esta última é a que define
-- o conjunto vigente de 10 valores, repetido abaixo por completo, nenhum
-- removido, só com SALE_DETAILS_UPDATED acrescentado ao final.
--
-- Impacto nos dados atuais: nenhum. Só reconstrói a constraint CHECK com um
-- superconjunto dos valores já aceitos — mesmo padrão idempotente (drop + add)
-- de toda migration anterior desta tabela. Nenhuma linha é lida, apagada ou
-- alterada; nenhuma coluna de delivery_status, nenhuma intake, nenhuma
-- tentativa de conferência e nenhum fulfillment_record é tocado; nenhuma
-- policy, grant ou RLS é tocada.
--
-- SALE_DETAILS_UPDATED é usada por EDITAR DADOS DA VENDA (pós-aprovação):
-- correção de vendedora, data da venda ou origem num fulfillment_records já
-- aprovado. Nunca para o valor (sale_total fica travado nesta versão —
-- decisão de negócio, não técnica). Sem PII no `details` (vendedora é um id
-- interno, data e origem não são dados da cliente).
-- ============================================================================

alter table public.fulfillment_audit_logs drop constraint if exists fulfillment_audit_logs_action_check;
alter table public.fulfillment_audit_logs
  add constraint fulfillment_audit_logs_action_check
  check (action in (
    'CREATED',
    'DOCUMENT_VIEWED',
    'DELIVERY_UPDATED',
    'TRACKING_WHATSAPP_OPENED',
    'TRACKING_MESSAGE_CONFIRMED',
    'DELIVERY_CONFIRMATION_WHATSAPP_OPENED',
    'DELIVERY_CONFIRMATION_CONFIRMED',
    'GOOGLE_REVIEW_WHATSAPP_OPENED',
    'GOOGLE_REVIEW_CONFIRMED',
    'TRACKING_CODE_SAVED',
    'SALE_DETAILS_UPDATED'
  ));
