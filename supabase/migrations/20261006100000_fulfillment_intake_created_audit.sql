-- ============================================================================
-- Auditoria própria do registro criado por aprovação de intake.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Motivo: approve_fulfillment_intake gravava FULFILLMENT_CREATED só em
-- fulfillment_intake_audit_logs. O fulfillment_record criado não tinha nenhuma
-- linha própria em fulfillment_audit_logs (o fluxo antigo de PDF grava CREATED).
--
-- Mudança: só a função. Após criar o registro definitivo, grava CREATED em
-- fulfillment_audit_logs com ator e details sem dado pessoal.
--
-- Não altera tabela, constraint, grant nem registros existentes.
-- Não cria log retroativo para registros já criados (ex.: Neusa, Rosiane).
-- CREATED já é ação válida em fulfillment_audit_logs_action_check.
-- ============================================================================

create or replace function public.approve_fulfillment_intake(
  p_intake uuid,
  p_attempt integer,
  p_record jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intake fulfillment_intakes%rowtype;
  v_att fulfillment_verification_attempts%rowtype;
  v_latest integer;
  v_record_id uuid;
  v_actor uuid := auth.uid();
begin
  if not is_admin() then
    raise exception 'sem permissão para aprovar' using errcode = '42501';
  end if;

  select * into v_intake from fulfillment_intakes where id = p_intake for update;
  if not found then
    raise exception 'solicitação não encontrada';
  end if;
  if v_intake.status = 'APPROVED' and v_intake.approved_record_id is not null then
    return v_intake.approved_record_id;
  end if;
  if v_intake.status not in ('CHECKING', 'REVIEW_REQUIRED') then
    raise exception 'a conferência ainda não permite aprovação';
  end if;

  select max(attempt_no) into v_latest from fulfillment_verification_attempts where intake_id = p_intake;
  if v_latest is null or p_attempt <> v_latest then
    raise exception 'só a tentativa atual pode ser aprovada';
  end if;

  select * into v_att from fulfillment_verification_attempts where intake_id = p_intake and attempt_no = p_attempt;
  if v_att.verdict = 'BLOCKED' then
    raise exception 'conferência bloqueada: não há aprovação com divergência crítica';
  end if;
  if v_att.verdict = 'REVIEW' and not (v_att.review_fields <@ v_att.reviewed_fields) then
    raise exception 'marque todos os avisos como revisados antes de aprovar';
  end if;

  v_record_id := (p_record->>'id')::uuid;

  insert into fulfillment_records (
    id, customer_name, customer_name_search, customer_cpf, customer_whatsapp,
    address_line, address_number, address_complement, neighborhood, postal_code, city, state,
    nfe_number, nfe_series, nfe_key, nfe_protocol, nfe_issued_at, items_count, invoice_total,
    carrier, shipping_service, tracking_code, shipping_label_date,
    sale_date, seller_id, sales_origin, delivery_status, status,
    danfe_file_path, label_file_path, sale_total, payment_method, installments, created_by,
    sti3_sale_id
  ) values (
    v_record_id,
    p_record->>'customer_name', p_record->>'customer_name_search', p_record->>'customer_cpf', p_record->>'customer_whatsapp',
    p_record->>'address_line', p_record->>'address_number', p_record->>'address_complement', p_record->>'neighborhood',
    p_record->>'postal_code', p_record->>'city', p_record->>'state',
    p_record->>'nfe_number', p_record->>'nfe_series', p_record->>'nfe_key', p_record->>'nfe_protocol',
    nullif(p_record->>'nfe_issued_at', '')::timestamptz, nullif(p_record->>'items_count', '')::integer,
    nullif(p_record->>'invoice_total', '')::numeric,
    p_record->>'carrier', p_record->>'shipping_service', p_record->>'tracking_code',
    nullif(p_record->>'shipping_label_date', '')::date,
    v_intake.sale_date, v_intake.seller_id, null, 'PENDING', 'CONFIRMED',
    p_record->>'danfe_file_path', p_record->>'label_file_path',
    v_intake.sale_total, v_intake.payment_method, null, v_actor,
    v_intake.sti3_sale_id
  );

  -- Auditoria própria do registro (sem dado pessoal: só a origem)
  insert into fulfillment_audit_logs (record_id, action, actor_id, details)
  values (v_record_id, 'CREATED', v_actor, jsonb_build_object('source', 'FULFILLMENT_INTAKE'));

  update fulfillment_intakes
     set status = 'APPROVED', approved_record_id = v_record_id, updated_at = now()
   where id = p_intake;

  insert into fulfillment_intake_audit_logs (intake_id, action, actor_id, details)
  values
    (p_intake, 'INTAKE_APPROVED', v_actor, jsonb_build_object('attempt', p_attempt)),
    (p_intake, 'FULFILLMENT_CREATED', v_actor, jsonb_build_object('record_id', v_record_id));

  return v_record_id;
end;
$$;

-- Privilégios inalterados (a função já é executável só por authenticated).
revoke all on function public.approve_fulfillment_intake(uuid, integer, jsonb) from public, anon;
grant execute on function public.approve_fulfillment_intake(uuid, integer, jsonb) to authenticated;
