-- ============================================================================
-- fulfillment_audit_logs: ações de pós-venda por WhatsApp.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
-- Migration NOVA e aditiva. Não edita migration já aplicada.
-- Motivo: a constraint atual de `action` aceita só CREATED, DOCUMENT_VIEWED e
-- DELIVERY_UPDATED. Sem esta migration, os cliques de pós-venda seriam recusados
-- pelo banco (e nada é aberto no WhatsApp nesse caso).
-- Não cria coluna: o estado das ações sai da própria trilha de auditoria.
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
    'GOOGLE_REVIEW_CONFIRMED'
  ));
