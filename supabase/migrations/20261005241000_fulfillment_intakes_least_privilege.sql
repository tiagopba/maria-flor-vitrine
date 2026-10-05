-- ============================================================================
-- Least privilege das tabelas do pré-faturamento. Migration ADITIVA.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
-- Não altera RLS, policies, dados, a função approve_fulfillment_intake nem os
-- registros reais de fulfillment_records.
--
-- 1. Remove TODOS os privilégios das três tabelas para anon, authenticated e PUBLIC.
-- 2. Devolve a authenticated só o necessário para o fluxo do Admin (RLS is_admin()):
--      fulfillment_intakes:               select, insert, update
--      fulfillment_intake_audit_logs:     select, insert
--      fulfillment_verification_attempts: select, insert, update
--    Sem DELETE, TRUNCATE, TRIGGER nem REFERENCES para authenticated.
-- 3. anon continua sem nenhum privilégio.
-- 4. authenticated mantém EXECUTE de approve_fulfillment_intake: a própria função
--    valida is_admin() antes de qualquer coisa.
-- ============================================================================

revoke all privileges
on table public.fulfillment_intakes
from anon, authenticated, public;

revoke all privileges
on table public.fulfillment_intake_audit_logs
from anon, authenticated, public;

revoke all privileges
on table public.fulfillment_verification_attempts
from anon, authenticated, public;

grant select, insert, update
on table public.fulfillment_intakes
to authenticated;

grant select, insert
on table public.fulfillment_intake_audit_logs
to authenticated;

grant select, insert, update
on table public.fulfillment_verification_attempts
to authenticated;
