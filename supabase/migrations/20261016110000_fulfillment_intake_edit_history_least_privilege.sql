-- ============================================================================
-- Endurecimento de privilégios de public.fulfillment_intake_edit_history
-- (menor privilégio completo) — mesmo padrão já aplicado em sellers
-- (20261005200000_sellers_least_privilege.sql), mas de forma exaustiva:
-- REVOKE ALL primeiro, depois só o GRANT explicitamente necessário.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Achado numa verificação de privilégios depois de aplicar
-- 20261016100000_fulfillment_intake_admin_edit.sql: esta instância do Supabase
-- concede, por padrão (default privileges de "postgres" e "supabase_admin" no
-- schema public), DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE a
-- "anon" e "authenticated" em QUALQUER tabela nova. A primeira versão desta
-- migration só revogava truncate/references/trigger de authenticated
-- (replicava o padrão de sellers pela metade). Esta versão aplica o mesmo
-- "least privilege completo" pedido: REVOKE ALL de PUBLIC, anon e
-- authenticated primeiro, depois GRANT SELECT só para authenticated — nada
-- fica concedido por omissão, só o que foi concedido de propósito.
--
-- A tabela é privada e append-only por desenho:
--   leitura  → só SELECT para authenticated; a RLS (policy
--              "fulfillment_intake_edit_history_admin_select", using is_admin())
--              continua sendo quem decide que só Admin/Master realmente lê.
--   escrita  → nunca concedida a PUBLIC/anon/authenticated (nem INSERT, nem
--              UPDATE, nem DELETE, nem TRUNCATE, nem REFERENCES, nem TRIGGER).
--              A única escrita é a função SECURITY DEFINER
--              edit_fulfillment_intake, que grava como seu próprio dono
--              (confirmado por leitura antes desta migration: a função e a
--              tabela pertencem a "postgres" — privilégio de dono, não de ACL;
--              revogar authenticated/anon/PUBLIC não afeta essa escrita).
--
-- Não altera RLS, não altera a função edit_fulfillment_intake, não altera
-- grants de service_role/postgres.
-- ============================================================================

revoke all on table public.fulfillment_intake_edit_history
from public, anon, authenticated;

grant select on table public.fulfillment_intake_edit_history to authenticated;
