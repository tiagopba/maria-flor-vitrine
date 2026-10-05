-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: Preview e Production compartilham o mesmo banco).
-- ============================================================================
-- public.sellers: (1) RLS de escrita só para Admin/Master e (2) WhatsApp
-- opcional para vendedora INATIVA (ex-funcionária cadastrada só para
-- preservar histórico), obrigatório e válido para vendedora ATIVA.
--
-- Auditoria dos consumidores feita antes de mexer na RLS:
--   - WhatsApp (click-action, favorites-click-action), modal público
--     (getActiveSellersForModal) e dashboard leem `sellers` com a SERVICE
--     ROLE — que ignora RLS. Nada disso muda.
--   - Os únicos leitores com a sessão do usuário são páginas/ações de
--     Admin/Master (Vendedoras e Faturamento e Envios).
--   - Nenhum fluxo depende de catalog_editor ler ou escrever em `sellers`.
--
-- Policies (antes: uma só, `sellers_admin_all`, FOR ALL com
-- is_catalog_editor_or_admin(), que deixava catalog_editor escrever):
--   SELECT  → is_admin()           (Admin/Master)
--   INSERT  → is_admin()
--   UPDATE  → is_admin()
--   DELETE  → nenhuma policy + privilégio revogado de anon/authenticated:
--             nenhum usuário da aplicação apaga vendedora (o histórico depende
--             do seller_id). service_role segue como acesso de manutenção.
--
-- Idempotente: pode rodar mais de uma vez. Não cria tabela nova, não remove
-- dado, não altera nenhuma linha existente.
-- ============================================================================

-- ── RLS ──────────────────────────────────────────────────────────────────────

drop policy if exists "sellers_admin_all" on public.sellers;
drop policy if exists "sellers_admin_select" on public.sellers;
drop policy if exists "sellers_admin_insert" on public.sellers;
drop policy if exists "sellers_admin_update" on public.sellers;

create policy "sellers_admin_select" on public.sellers
  for select
  using (is_admin());

create policy "sellers_admin_insert" on public.sellers
  for insert
  with check (is_admin());

create policy "sellers_admin_update" on public.sellers
  for update
  using (is_admin())
  with check (is_admin());

-- Cinto + suspensório: sem policy de DELETE a RLS já nega; o privilégio também sai.
revoke delete on table public.sellers from anon, authenticated;

-- ── WhatsApp opcional só para inativa ────────────────────────────────────────

alter table public.sellers alter column whatsapp_number drop not null;

-- Formato: quando existe, só dígitos (DDI+DDD+número, 10–15). As 4 vendedoras
-- atuais já seguem esse formato (verificado antes de escrever esta migration).
alter table public.sellers drop constraint if exists sellers_whatsapp_format_check;
alter table public.sellers
  add constraint sellers_whatsapp_format_check
  check (whatsapp_number is null or whatsapp_number ~ '^[0-9]{10,15}$');

-- Regra no BANCO (não só no formulário): vendedora ativa SEMPRE tem WhatsApp.
-- Reativar uma ex-vendedora sem número é rejeitado até informar um WhatsApp válido.
alter table public.sellers drop constraint if exists sellers_active_requires_whatsapp_check;
alter table public.sellers
  add constraint sellers_active_requires_whatsapp_check
  check (active = false or whatsapp_number is not null);
