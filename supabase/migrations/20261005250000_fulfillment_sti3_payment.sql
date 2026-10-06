-- ============================================================================
-- Número da venda STI3 + forma de pagamento Itaú (V1). Migration ADITIVA.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Impacto nos dados atuais:
--   - fulfillment_records: 2 registros reais recebem sti3_sale_id = NULL e
--     payment_method permanece NULL. Nada é reescrito.
--   - fulfillment_intakes: nenhuma linha existente é alterada.
--   - installments NÃO é removida. No fluxo novo fica NULL.
--   - Códigos genéricos antigos continuam válidos nas constraints (para registros já
--     existentes). A aplicação recusa esses códigos em NOVAS solicitações.
--
-- Não é NOT NULL em fulfillment_records (há registros antigos). A obrigatoriedade para
-- novas solicitações é garantida no intake e no servidor.
-- ============================================================================

-- ── 1. Número da venda STI3 ────────────────────────────────────────────────────
-- Identificador textual (não assumir inteiro). Sem espaços nas pontas, 1 a 40 caracteres.

alter table public.fulfillment_intakes
  add column if not exists sti3_sale_id text;

alter table public.fulfillment_intakes drop constraint if exists fulfillment_intakes_sti3_sale_id_check;
alter table public.fulfillment_intakes
  add constraint fulfillment_intakes_sti3_sale_id_check
  check (sti3_sale_id is null or (length(sti3_sale_id) between 1 and 40 and sti3_sale_id = btrim(sti3_sale_id)));

alter table public.fulfillment_records
  add column if not exists sti3_sale_id text;

alter table public.fulfillment_records drop constraint if exists fulfillment_records_sti3_sale_id_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_sti3_sale_id_check
  check (sti3_sale_id is null or (length(sti3_sale_id) between 1 and 40 and sti3_sale_id = btrim(sti3_sale_id)));

-- Evita duplicidade: uma solicitação por venda STI3 e um registro definitivo por venda STI3.
-- Índices parciais: registros antigos (NULL) não entram na regra.
-- Também servem à busca futura pelo número STI3.
create unique index if not exists fulfillment_intakes_sti3_sale_id_uniq
  on public.fulfillment_intakes (sti3_sale_id)
  where sti3_sale_id is not null;

create unique index if not exists fulfillment_records_sti3_sale_id_uniq
  on public.fulfillment_records (sti3_sale_id)
  where sti3_sale_id is not null;

-- ── 2. Forma de pagamento: 4 códigos Itaú + códigos legados (somente leitura) ───

alter table public.fulfillment_intakes drop constraint if exists fulfillment_intakes_payment_method_check;
alter table public.fulfillment_intakes
  add constraint fulfillment_intakes_payment_method_check
  check (payment_method in (
    'ITAU_CREDIT_ELO_AMEX', 'ITAU_CREDIT_MASTER', 'ITAU_CREDIT_VISA', 'ITAU_PIX',
    'PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'CDC', 'OTHER'
  ));

alter table public.fulfillment_records drop constraint if exists fulfillment_records_payment_method_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_payment_method_check
  check (payment_method is null or payment_method in (
    'ITAU_CREDIT_ELO_AMEX', 'ITAU_CREDIT_MASTER', 'ITAU_CREDIT_VISA', 'ITAU_PIX',
    'PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'CDC', 'OTHER'
  ));

-- installments: as constraints já existentes aceitam NULL para os novos códigos
-- (não são CREDIT_CARD, então installments deve ser NULL). Nada muda aqui.

-- ── 3. Aprovação atômica: agora copia o STI3 ─────────────────────────────────────
-- Mesma regra da migration 20261005240000 (is_admin, estado, tentativa atual, BLOCKED,
-- revisão de avisos, FOR UPDATE, idempotência). Única diferença: sti3_sale_id.

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

revoke all on function public.approve_fulfillment_intake(uuid, integer, jsonb) from public, anon;
grant execute on function public.approve_fulfillment_intake(uuid, integer, jsonb) to authenticated;
