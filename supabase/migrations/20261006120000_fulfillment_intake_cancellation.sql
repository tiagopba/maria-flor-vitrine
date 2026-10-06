-- ============================================================================
-- Cancelamento de solicitação de pré-faturamento (status CANCELLED).
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Aditiva: não apaga intake, tentativa, log nem PDF. Não altera registros existentes
-- (as colunas novas nascem NULL). Não remove policy, grant nem RLS existente.
--
-- Só cancela enquanto a intake NÃO foi aprovada e não tem fulfillment_record.
-- A função roda como o próprio Admin (SECURITY INVOKER): as policies is_admin() já
-- autorizam select/update em fulfillment_intakes e insert em fulfillment_intake_audit_logs.
-- ============================================================================

-- 1. Colunas de cancelamento (todas NULL em registros existentes).
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

-- 3. Integridade do cancelamento.
-- 3a. Códigos de motivo aceitos (somente estes quatro).
alter table public.fulfillment_intakes drop constraint if exists fulfillment_intakes_cancel_reason_check;
alter table public.fulfillment_intakes
  add constraint fulfillment_intakes_cancel_reason_check check (cancel_reason is null or cancel_reason in (
    'CUSTOMER_WITHDREW', 'CANCELLED_IN_STI3', 'CREATED_BY_MISTAKE', 'OTHER'
  ));

-- 3b. Observação: 1 a 280 caracteres, e só existe com o motivo OTHER.
alter table public.fulfillment_intakes drop constraint if exists fulfillment_intakes_cancel_note_check;
alter table public.fulfillment_intakes
  add constraint fulfillment_intakes_cancel_note_check check (
    cancel_note is null or (length(cancel_note) between 1 and 280 and cancel_reason = 'OTHER')
  );

-- 3c. CANCELLED exige data e motivo; OTHER exige observação.
alter table public.fulfillment_intakes drop constraint if exists fulfillment_intakes_cancelled_consistency_check;
alter table public.fulfillment_intakes
  add constraint fulfillment_intakes_cancelled_consistency_check check (
    status <> 'CANCELLED' or (
      cancelled_at is not null
      and cancel_reason is not null
      and (cancel_reason <> 'OTHER' or cancel_note is not null)
    )
  );

-- 3d. Fora de CANCELLED, nenhum campo de cancelamento fica preenchido.
alter table public.fulfillment_intakes drop constraint if exists fulfillment_intakes_cancel_fields_only_when_cancelled_check;
alter table public.fulfillment_intakes
  add constraint fulfillment_intakes_cancel_fields_only_when_cancelled_check check (
    status = 'CANCELLED' or (cancelled_at is null and cancel_reason is null and cancel_note is null)
  );

-- 4. Nova ação de auditoria (sem PII).
alter table public.fulfillment_intake_audit_logs drop constraint if exists fulfillment_intake_audit_logs_action_check;
alter table public.fulfillment_intake_audit_logs
  add constraint fulfillment_intake_audit_logs_action_check check (action in (
    'INTAKE_CREATED', 'INTAKE_LINK_OPENED', 'INTAKE_DATA_RECEIVED', 'INTAKE_LINK_REOPENED',
    'INTAKE_CHECK_STARTED', 'INTAKE_BLOCKED', 'INTAKE_CHECK_RESTARTED', 'INTAKE_REVIEW_COMPLETED',
    'INTAKE_APPROVED', 'FULFILLMENT_CREATED', 'INTAKE_CANCELLED'
  ));

-- 5. Cancelada não volta ao fluxo ativo por UPDATE comum.
-- Qualquer reativação exigirá uma ação futura explícita, que desabilite este trigger de forma
-- deliberada. Até lá, status e campos de cancelamento são imutáveis.
create or replace function public.fulfillment_intakes_block_cancelled_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'CANCELLED' and (
       new.status is distinct from old.status
    or new.cancelled_at is distinct from old.cancelled_at
    or new.cancel_reason is distinct from old.cancel_reason
    or new.cancel_note is distinct from old.cancel_note
    or new.token_hash is distinct from old.token_hash
  ) then
    raise exception 'solicitação cancelada não pode ser alterada';
  end if;
  return new;
end;
$$;

drop trigger if exists fulfillment_intakes_block_cancelled on public.fulfillment_intakes;
create trigger fulfillment_intakes_block_cancelled
  before update on public.fulfillment_intakes
  for each row execute function public.fulfillment_intakes_block_cancelled_changes();

-- 6. Cancelamento atômico. SECURITY INVOKER: quem chama precisa ser Admin/Master pelas policies.
create or replace function public.cancel_fulfillment_intake(
  p_intake uuid,
  p_reason text,
  p_note text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_row fulfillment_intakes%rowtype;
  v_actor uuid := auth.uid();
  v_note text;
begin
  -- 1. Permissão ANTES de qualquer leitura ou escrita.
  if not is_admin() then
    raise exception 'sem permissão para cancelar' using errcode = '42501';
  end if;

  -- 2. Motivo.
  if p_reason not in ('CUSTOMER_WITHDREW', 'CANCELLED_IN_STI3', 'CREATED_BY_MISTAKE', 'OTHER') then
    raise exception 'motivo de cancelamento inválido';
  end if;

  -- 3. Observação: só para OTHER, obrigatória e até 280 caracteres. Para os demais, nunca é gravada.
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if p_reason = 'OTHER' then
    if v_note is null then
      raise exception 'explique o motivo em uma frase curta';
    end if;
    if length(v_note) > 280 then
      raise exception 'a observação pode ter no máximo 280 caracteres';
    end if;
  else
    v_note := null;
  end if;

  -- 4. Trava a linha e confere o estado atual.
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

  -- 5. Mudança e invalidação do token na MESMA transação.
  -- O hash antigo deixa de casar com qualquer token: o link público para de funcionar.
  update fulfillment_intakes
     set status = 'CANCELLED',
         cancelled_at = now(),
         cancel_reason = p_reason,
         cancel_note = v_note,
         token_hash = 'cancelled:' || gen_random_uuid()::text,
         updated_at = now()
   where id = p_intake;

  -- 6. Auditoria: só ação, ator, data (default) e código do motivo. Nunca cancel_note nem PII.
  insert into fulfillment_intake_audit_logs (intake_id, action, actor_id, details)
  values (p_intake, 'INTAKE_CANCELLED', v_actor, jsonb_build_object('reason', p_reason));
end;
$$;

-- 7. Privilégios: só authenticated pode executar; anon e PUBLIC não. A checagem is_admin()
-- continua dentro da função, então um authenticated não-admin é recusado.
revoke all on function public.cancel_fulfillment_intake(uuid, text, text) from public, anon;
grant execute on function public.cancel_fulfillment_intake(uuid, text, text) to authenticated;
revoke all on function public.fulfillment_intakes_block_cancelled_changes() from public, anon;
