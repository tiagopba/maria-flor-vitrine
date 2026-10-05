-- ============================================================================
-- Endurecimento de privilégios de public.sellers (menor privilégio).
-- ============================================================================
-- Migration NOVA e aditiva. NÃO edita 20261005190000 nem qualquer migration já
-- aplicada. NÃO altera policies RLS (quem decide o acesso autenticado continua
-- sendo is_admin()), nem grants de service_role/postgres.
--
--   anon          sem nenhum privilégio: nenhum fluxo usa sellers com o client
--                 anon (vitrine e WhatsApp usam service role; Admin usa sessão).
--   authenticated mantém SELECT, INSERT e UPDATE (Admin/Master, via RLS);
--                 perde TRUNCATE (não passa pela RLS e, com CASCADE, atinge
--                 fulfillment_records), REFERENCES e TRIGGER (não usados).
--                 DELETE já estava revogado na migration 20261005190000.
-- ============================================================================

revoke all on table public.sellers from anon;

revoke truncate, references, trigger
on table public.sellers
from authenticated;
