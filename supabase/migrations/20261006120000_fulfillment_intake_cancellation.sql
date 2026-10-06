-- ============================================================================
-- Cancelamento de solicitação de pré-faturamento (status CANCELLED).
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Aditiva: não apaga intake, tentativa, log nem PDF. Não altera registros existentes.
-- Só cancela enquanto a intake NÃO foi aprovada (sem fulfillment_record).
--
-- O cancelamento acontece numa única função, em transação:
--   - status = 'CANCELLED', cancelled_at, cancel_reason (código);
--   - cancel_note (texto livre, só no registro privado da intake; só para motivo OTHER);
--   - token_hash é trocado: o link público antigo deixa de existir imediatamente;
--   - grava INTAKE_CANCELLED no log SEM PII (só o código do motivo).
-- ============================================================================

-- 1. Colunas de cancelamento (todas nulas em registros existentes).
alter table public.fulfillment_intakes
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists cancel_note text;

-- 2. Novo status.
alter table public.fulfillment_intakes drop constraint if exists fulfillment_intakes_status_check;
alter table public.fulfillment_intakes
  add constraint fulfillment_intakes_status_check check (status in (
    'AWAITING_CUSTOMER_DATA', 'DATA_RECEIVED', 'DOCUMENTS_PENDING', 'CHECKING',
    'REVIEW_REQUIRED', 'BLOCKED', 'APPROVED', 'CANCELLED'
  ));

-- 3. Códigos de motivo e consistência do cancelamento.
alter table public.fulfillment_intakes drop constraint if exists fulfillment_intakes_cancel_reason_check;
alter table public.fulfillment_intakes
  add constraint fulfillment_intakes_cancel_reason_check check (cancel_reason is null or cancel_reason in (
    'CUSTOMER_WITHDREW', 'CANCELLED_IN_STI3', 'CREATED_BY_MISTAKE', 'OTHER'
  ));

alter table public.fulfillment_intakes drop constraint if exists fulfillment_intakes_cancel_note_check;
alter table public.fulfillment_intakes
  add constraint fulfillment_intakes_cancel_note_check check (cancel_note is null or length(cancel_note) between 1 and 280);

alter table public.fulfillment_intakes drop constraint if exists fulfillment_intakes_cancelled_consistency_check;
alter table public.fulfillment_intakes
  add constraint fulfillment_intakes_cancelled_consistency_check check (
    status <> 'CANCELLED' or (
      cancelled_at is not null
      and cancel_reason is not null
      and (cancel_reason <> 'OTHER' or cancel_note is not null)
    )
  );

-- 4. Nova ação de auditoria (sem PII).
alter table public.fulfillment_intake_audit_logs drop constraint if exists fulfillment_intake_audit_logs_action_check;
alter table public.fulfillment_intake_audit_logs
  add constraint fulfillment_intake_audit_logs_action_check check (action in (
    'INTAKE_CREATED', 'INTAKE_LINK_OPENED', 'INTAKE_DATA_RECEIVED', 'INTAKE_LINK_REOPENED',
    'INTAKE_CHECK_STARTED', 'INTAKE_BLOCKED', 'INTAKE_CHECK_RESTARTED', 'INTAKE_REVIEW_COMPLETED',
    'INTAKE_APPROVED', 'FULFILLMENT_CREATED', 'INTAKE_CANCELLED'
  ));

-- 5. Cancelamento atômico. Só Admin/Master (is_admin), só antes da aprovação.
create or replace function public.cancel_fulfillment_intake(
  p_intake uuid,
  p_reason text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row fulfillment_intakes%rowtype;
  v_actor uuid := auth.uid();
begin
  if not is_admin() then
    raise exception 'sem permissão para cancelar' using errcode = '42501';
  end if;

  if p_reason not in ('CUSTOMER_WITHDREW', 'CANCELLED_IN_STI3', 'CREATED_BY_MISTAKE', 'OTHER') then
    raise exception 'motivo de cancelamento inválido';
  end if;

  select * into v_row from fulfillment_intakes where id = p_intake for update;
  if not found then
    raise exception 'solicitação não encontrada';
  end if;
  if v_row.status = 'CANCELLED' then
    raise exception 'esta solicitação já está cancelada';
  end if;
  if v_row.status = 'APPROVED' or v_row.approved_record_id is not null then
    raise exception 'venda já aprovada: o cancelamento agora segue pelo fulfillment';
  end if;

  update fulfillment_intakes
     set status = 'CANCELLED',
         cancelled_at = now(),
         cancel_reason = p_reason,
         cancel_note = nullif(btrim(coalesce(p_note, '')), ''),
         -- Invalida o link público: o hash antigo deixa de casar com qualquer token.
         token_hash = 'cancelled:' || gen_random_uuid()::text,
         updated_at = now()
   where id = p_intake;

  -- Auditoria sem PII: só o código do motivo. Nome, CPF, telefone, endereço e texto livre ficam fora.
  insert into fulfillment_intake_audit_logs (intake_id, action, actor_id, details)
  values (p_intake, 'INTAKE_CANCELLED', v_actor, jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.cancel_fulfillment_intake(uuid, text, text) from public, anon;
grant execute on function public.cancel_fulfillment_intake(uuid, text, text) to authenticated;
