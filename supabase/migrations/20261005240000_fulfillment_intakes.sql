-- ============================================================================
-- Pré-faturamento / coleta de dados (V1). Migration ADITIVA.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
-- Não edita migration já aplicada. Não altera registros existentes:
-- as colunas novas de fulfillment_records nascem NULL.
-- Acesso: RLS só is_admin() (Admin/Master). A cliente NÃO acessa tabela alguma:
-- o link público usa o servidor (service role), validando token por hash.
-- Nunca guarda número de cartão, CVV, validade ou dado bancário.
-- ============================================================================

-- ── 1. Solicitações (pré-faturamento) ────────────────────────────────────────
create table if not exists public.fulfillment_intakes (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.sellers(id) on delete set null,
  sale_date date not null,
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_whatsapp text check (customer_whatsapp is null or customer_whatsapp ~ '^55[1-9][0-9]9[0-9]{8}$'),
  sale_total numeric(12,2) not null check (sale_total > 0),
  payment_method text not null check (payment_method in ('PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'CDC', 'OTHER')),
  installments integer check (installments is null or installments between 1 and 12),
  constraint fulfillment_intakes_installments_by_method_check check (
    (payment_method = 'CREDIT_CARD' and installments is not null)
    or (payment_method <> 'CREDIT_CARD' and installments is null)
  ),
  internal_notes text check (internal_notes is null or length(internal_notes) <= 1000),
  status text not null default 'AWAITING_CUSTOMER_DATA' check (status in (
    'AWAITING_CUSTOMER_DATA', 'DATA_RECEIVED', 'DOCUMENTS_PENDING', 'CHECKING',
    'REVIEW_REQUIRED', 'BLOCKED', 'APPROVED'
  )),
  -- Token: só o HASH SHA-256 é guardado. O token em claro existe apenas na URL.
  token_hash text not null unique,
  token_expires_at timestamptz not null,
  -- Preenchido quando a cliente envia. Depois disso o link público fica bloqueado.
  submitted_at timestamptz,
  -- Dados da cliente (PII privado; só Admin/Master lê).
  submitted_name text,
  submitted_cpf text,
  submitted_email text,
  submitted_whatsapp text check (submitted_whatsapp is null or submitted_whatsapp ~ '^55[1-9][0-9]9[0-9]{8}$'),
  submitted_delivery_to_customer boolean,
  submitted_recipient_name text,
  submitted_postal_code text,
  submitted_address_line text,
  submitted_address_number text,
  submitted_address_complement text,
  submitted_neighborhood text,
  submitted_city text,
  submitted_state text,
  approved_record_id uuid references public.fulfillment_records(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fulfillment_intakes_status_idx on public.fulfillment_intakes (status, created_at desc);

alter table public.fulfillment_intakes enable row level security;
revoke all on table public.fulfillment_intakes from anon;

drop policy if exists "fulfillment_intakes_admin_select" on public.fulfillment_intakes;
create policy "fulfillment_intakes_admin_select" on public.fulfillment_intakes
  for select using (is_admin());

drop policy if exists "fulfillment_intakes_admin_insert" on public.fulfillment_intakes;
create policy "fulfillment_intakes_admin_insert" on public.fulfillment_intakes
  for insert with check (is_admin());

drop policy if exists "fulfillment_intakes_admin_update" on public.fulfillment_intakes;
create policy "fulfillment_intakes_admin_update" on public.fulfillment_intakes
  for update using (is_admin()) with check (is_admin());

-- Sem policy de DELETE: solicitações não são apagadas pelo app.
revoke delete on table public.fulfillment_intakes from anon, authenticated;

-- ── 2. Auditoria própria do pré-faturamento (sem PII) ────────────────────────
create table if not exists public.fulfillment_intake_audit_logs (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null,
  action text not null check (action in (
    'INTAKE_CREATED', 'INTAKE_LINK_OPENED', 'INTAKE_DATA_RECEIVED', 'INTAKE_LINK_REOPENED',
    'INTAKE_CHECK_STARTED', 'INTAKE_BLOCKED', 'INTAKE_CHECK_RESTARTED', 'INTAKE_REVIEW_COMPLETED',
    'INTAKE_APPROVED', 'FULFILLMENT_CREATED'
  )),
  actor_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fulfillment_intake_audit_logs_intake_idx
  on public.fulfillment_intake_audit_logs (intake_id, created_at desc);

alter table public.fulfillment_intake_audit_logs enable row level security;
revoke all on table public.fulfillment_intake_audit_logs from anon;

drop policy if exists "fulfillment_intake_audit_logs_admin_select" on public.fulfillment_intake_audit_logs;
create policy "fulfillment_intake_audit_logs_admin_select" on public.fulfillment_intake_audit_logs
  for select using (is_admin());

drop policy if exists "fulfillment_intake_audit_logs_admin_insert" on public.fulfillment_intake_audit_logs;
create policy "fulfillment_intake_audit_logs_admin_insert" on public.fulfillment_intake_audit_logs
  for insert with check (is_admin());

revoke update, delete on table public.fulfillment_intake_audit_logs from anon, authenticated;

-- ── 3. Tentativas de conferência (histórico; nunca apagadas) ────────────────
create table if not exists public.fulfillment_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.fulfillment_intakes(id),
  attempt_no integer not null check (attempt_no >= 1),
  verdict text not null check (verdict in ('GREEN', 'REVIEW', 'BLOCKED')),
  blocking_fields text[] not null default '{}',
  review_fields text[] not null default '{}',
  reviewed_fields text[] not null default '{}',
  -- Valores comparados: PII privada, só Admin/Master (nunca vai para audit/analytics).
  comparison jsonb not null default '{}'::jsonb,
  danfe_file_path text not null,
  label_file_path text not null,
  actor_id uuid,
  created_at timestamptz not null default now(),
  unique (intake_id, attempt_no)
);

alter table public.fulfillment_verification_attempts enable row level security;
revoke all on table public.fulfillment_verification_attempts from anon;

drop policy if exists "fulfillment_verification_attempts_admin_select" on public.fulfillment_verification_attempts;
create policy "fulfillment_verification_attempts_admin_select" on public.fulfillment_verification_attempts
  for select using (is_admin());

drop policy if exists "fulfillment_verification_attempts_admin_insert" on public.fulfillment_verification_attempts;
create policy "fulfillment_verification_attempts_admin_insert" on public.fulfillment_verification_attempts
  for insert with check (is_admin());

drop policy if exists "fulfillment_verification_attempts_admin_update" on public.fulfillment_verification_attempts;
create policy "fulfillment_verification_attempts_admin_update" on public.fulfillment_verification_attempts
  for update using (is_admin()) with check (is_admin());

revoke delete on table public.fulfillment_verification_attempts from anon, authenticated;

-- ── 4. Pagamento no registro definitivo (colunas NULL; registros atuais não mudam) ──
alter table public.fulfillment_records
  add column if not exists sale_total numeric(12,2),
  add column if not exists payment_method text,
  add column if not exists installments integer;

alter table public.fulfillment_records drop constraint if exists fulfillment_records_payment_method_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_payment_method_check
  check (payment_method is null or payment_method in ('PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'CDC', 'OTHER'));

alter table public.fulfillment_records drop constraint if exists fulfillment_records_installments_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_installments_check
  check (
    (payment_method is null and installments is null)
    or (payment_method = 'CREDIT_CARD' and installments between 1 and 12)
    or (payment_method is not null and payment_method <> 'CREDIT_CARD' and installments is null)
  );

-- ── 5. Aprovação atômica: cria o fulfillment_record uma única vez ──────────────
-- Chamada pela sessão do Admin (auth.uid()). Regras (todas no banco):
--  - só Admin/Master (is_admin());
--  - a solicitação precisa estar em CHECKING ou REVIEW_REQUIRED (ou já APPROVED → devolve o mesmo id);
--  - só a tentativa MAIS RECENTE pode aprovar; resultado antigo nunca libera nova tentativa;
--  - BLOCKED nunca aprova (não há bypass);
--  - REVIEW exige que TODOS os avisos estejam marcados como revisados;
--  - FOR UPDATE + checagem de APPROVED evitam duplicar o registro em clique duplo.
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
    danfe_file_path, label_file_path, sale_total, payment_method, installments, created_by
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
    v_intake.sale_total, v_intake.payment_method, v_intake.installments, v_actor
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
