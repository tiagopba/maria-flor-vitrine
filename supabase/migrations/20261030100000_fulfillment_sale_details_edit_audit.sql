-- ============================================================================
-- EDITAR VENDA / EDITAR DADOS DA VENDA — nova ação de auditoria em
-- fulfillment_audit_logs (pós-aprovação). Migration ADITIVA.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Impacto nos dados atuais: nenhum. Só reconstrói duas constraints CHECK com um
-- superconjunto dos valores já aceitos — mesmo padrão de todas as migrations
-- anteriores desta tabela (ex.: 20261015100000). Nenhuma linha é lida, apagada
-- ou alterada; nenhuma policy, grant ou RLS é tocada.
--
-- ── Parte 1 — fulfillment_audit_logs: SALE_DETAILS_UPDATED (NOVA) ───────────
-- Usada por EDITAR DADOS DA VENDA (pós-aprovação): correção de vendedora, data
-- da venda ou origem num fulfillment_records já aprovado. Nunca para o valor
-- (sale_total fica travado nesta versão — decisão de negócio, não técnica).
-- Sem PII no `details` (vendedora é um id interno, data e origem não são dados
-- da cliente).
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

-- ============================================================================
-- ── Parte 2 — fulfillment_intake_audit_logs: contingência para INTAKE_EDITED ─
--
-- EDITAR VENDA (pré-aprovação) reaproveita a ação INTAKE_EDITED — não cria
-- nenhuma ação nova para fulfillment_intake_audit_logs. O código deste
-- repositório (src/types/database.ts) já tipa INTAKE_EDITED como valor válido,
-- com uma nota de uma rodada anterior afirmando que essa ação JÁ ESTARIA
-- aceita na constraint real de Production (aplicada por uma migration de uma
-- branch antiga, nunca mergeada neste repositório).
--
-- Esta sessão NÃO tem acesso a psql/MCP de banco para confirmar isso por
-- leitura direta (nem supabase CLI linkado, nem connection string nas envs) —
-- só a leitura do código e do PROJECT_STATUS.md. Por isso esta Parte 2 é
-- deixada aqui, pronta, como contingência: reconstrói a constraint com os 13
-- valores já documentados no tipo TypeScript (nada removido, nada inventado).
-- Se a constraint real já tiver esses 13 valores, isto é só um no-op seguro
-- (idêntico padrão idempotente de "drop + add" usado em toda migration deste
-- projeto). Se NÃO tiver, isto é o que falta para EDITAR VENDA gravar auditoria
-- sem quebrar com "new row violates check constraint".
--
-- Recomendação: antes de aplicar, confirmar com uma consulta somente leitura
-- no SQL Editor:
--   select pg_get_constraintdef(oid)
--     from pg_constraint
--    where conname = 'fulfillment_intake_audit_logs_action_check';
-- Se já incluir INTAKE_EDITED, a Parte 2 pode ser aplicada mesmo assim (é
-- idempotente) ou simplesmente pulada.
-- ============================================================================

alter table public.fulfillment_intake_audit_logs drop constraint if exists fulfillment_intake_audit_logs_action_check;
alter table public.fulfillment_intake_audit_logs
  add constraint fulfillment_intake_audit_logs_action_check
  check (action in (
    'INTAKE_CREATED',
    'INTAKE_LINK_OPENED',
    'INTAKE_DATA_RECEIVED',
    'INTAKE_LINK_REOPENED',
    'INTAKE_CHECK_STARTED',
    'INTAKE_BLOCKED',
    'INTAKE_CHECK_RESTARTED',
    'INTAKE_REVIEW_COMPLETED',
    'INTAKE_APPROVED',
    'FULFILLMENT_CREATED',
    'INTAKE_CANCELLED',
    'INTAKE_EDITED',
    'LEGACY_FREIGHT_OVERRIDE_APPLIED'
  ));
