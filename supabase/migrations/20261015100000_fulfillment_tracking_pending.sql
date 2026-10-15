-- ============================================================================
-- Rastreamento pendente + Confere Geral por XML da NF-e (nfeProc).
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Duas mudanças que nascem juntas porque uma depende da outra:
--  1) aprovar a venda não exige mais ter o código de rastreio em mãos
--     (tracking_code/carrier já eram nullable; o que falta é dar suporte a
--     aprovar com os dois nulos e auditar quando são preenchidos depois);
--  2) a conferência de uma intake NOVA passa a usar só o XML autorizado da
--     NF-e (nfeProc), nunca mais DANFE+etiqueta em PDF — então o "documento
--     da tentativa" deixa de ser sempre os 2 PDFs e passa a ser PDFs OU XML.
--
-- Migration NOVA e aditiva. Não edita migration já aplicada, não apaga nem
-- altera dado existente. Registros e tentativas antigos (Neusa, Rosiane,
-- qualquer DANFE+etiqueta já aprovado) continuam intactos e visíveis: ganham
-- só xml_file_path = NULL, igual qualquer coluna nova. Nenhuma tentativa
-- antiga é reprocessada; nenhum arquivo antigo é apagado ou convertido.
-- ============================================================================

-- ── 1. fulfillment_audit_logs: nova ação TRACKING_CODE_SAVED ────────────────
-- Mesmo padrão de 20261005220000 (drop + add do constraint com o superconjunto).
-- O detalhe gravado nunca inclui o código de rastreio nem outro dado pessoal —
-- só metadados técnicos (transportadora, origem da ação).
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
    'TRACKING_CODE_SAVED'
  ));

-- ── 2. fulfillment_records: onde fica o XML aprovado ────────────────────────
alter table public.fulfillment_records add column if not exists xml_file_path text;

-- ── 3. fulfillment_verification_attempts: XML em vez de DANFE+etiqueta ──────
-- danfe_file_path/label_file_path nasceram NOT NULL (migration 20261005240000,
-- quando toda tentativa exigia os dois PDFs). Uma tentativa nova pode trazer só
-- o XML agora; o CHECK abaixo garante que toda tentativa, velha ou nova, tenha
-- pelo menos um conjunto completo de documento (nunca nenhum documento).
alter table public.fulfillment_verification_attempts add column if not exists xml_file_path text;
alter table public.fulfillment_verification_attempts alter column danfe_file_path drop not null;
alter table public.fulfillment_verification_attempts alter column label_file_path drop not null;

alter table public.fulfillment_verification_attempts
  drop constraint if exists fulfillment_verification_attempts_has_documents_check;
alter table public.fulfillment_verification_attempts
  add constraint fulfillment_verification_attempts_has_documents_check
  check (
    xml_file_path is not null
    or (danfe_file_path is not null and label_file_path is not null)
  );

-- ── 4. Bucket: XML passa a ser um tipo aceito, ao lado do PDF ───────────────
-- Mesmo bucket privado 'fulfillment-documents', mesmas policies (is_admin()) —
-- só o tipo de arquivo aceito muda. Sem isso o Storage recusaria o upload do
-- XML com "mime type not supported". Não remove 'application/pdf': o fluxo
-- antigo (Cadastro manual, histórico) continua subindo DANFE/etiqueta normalmente.
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'application/xml', 'text/xml']
 where id = 'fulfillment-documents';

-- ── 5. approve_fulfillment_intake: copia xml_file_path quando vier ──────────
-- Resto do corpo idêntico à versão vigente (20261006100000): mesma validação,
-- mesmas colunas, mesmo comportamento para danfe_file_path/label_file_path
-- (continuam opcionais como já eram — p_record->>'...' já virava NULL quando
-- a chave não vinha; nenhuma mudança de comportamento para o fluxo por PDF).
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
    danfe_file_path, label_file_path, xml_file_path, sale_total, payment_method, installments, created_by,
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
    p_record->>'danfe_file_path', p_record->>'label_file_path', p_record->>'xml_file_path',
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
