-- ============================================================================
-- fulfillment_records: WhatsApp do cliente (opcional, privado).
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
-- Migration NOVA e aditiva. Não altera nenhum registro existente: a coluna nasce
-- NULL e os registros atuais continuam sem WhatsApp (ABRIR WHATSAPP indisponível;
-- COPIAR MENSAGEM segue funcionando).
-- Formato guardado: 55 + DDD (2) + celular (9, começando em 9), só dígitos.
-- Dado pessoal: fica SOMENTE no registro de Faturamento (RLS já é só Admin/Master).
-- Nunca vai para analytics, Pixel/CAPI, localStorage nem para o log de auditoria.
-- ============================================================================

alter table public.fulfillment_records
  add column if not exists customer_whatsapp text;

alter table public.fulfillment_records drop constraint if exists fulfillment_records_customer_whatsapp_format_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_customer_whatsapp_format_check
  check (customer_whatsapp is null or customer_whatsapp ~ '^55[1-9][0-9]9[0-9]{8}$');
