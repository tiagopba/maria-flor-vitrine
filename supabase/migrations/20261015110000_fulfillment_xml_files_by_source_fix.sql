-- ============================================================================
-- Correção: record_source ganha XML_UPLOAD — fluxo XML nunca vira PDF_UPLOAD.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Achado no teste sintético em Preview/local, logo após aplicar
-- 20261015100000_fulfillment_tracking_pending.sql: aprovar uma intake XML-only
-- falhava com
--   "new row for relation fulfillment_records violates check constraint
--    fulfillment_records_files_by_source_check"
--
-- Causa raiz: fulfillment_records_record_source_check (de 20261005190100,
-- ANTES do fluxo XML existir) só conhece 'PDF_UPLOAD' e 'HISTORICAL_IMPORT'.
-- approve_fulfillment_intake nunca definia record_source, então toda aprovação
-- nascia com o DEFAULT 'PDF_UPLOAD' — inclusive quando vinha de uma tentativa
-- XML-only. Corrigir só a constraint de arquivos (como na primeira versão
-- desta migration, já descartada) teria disfarçado o problema: o registro
-- continuaria rotulado PDF_UPLOAD mesmo não tendo PDF nenhum, incoerente com
-- o que o dado realmente é.
--
-- Correção de verdade: um terceiro record_source, XML_UPLOAD, só para
-- aprovação vinda de tentativa XML. approve_fulfillment_intake passa a
-- decidir explicitamente entre os dois (nunca os dois juntos, nunca nenhum):
--   XML_UPLOAD  quando p_record.xml_file_path IS NOT NULL
--   PDF_UPLOAD  caso contrário (fluxo legado DANFE + etiqueta, inalterado)
-- HISTORICAL_IMPORT continua exclusivo da importação da planilha antiga —
-- nenhuma aprovação de intake usa esse valor, antes ou depois desta migration.
--
-- Falha pega em teste sintético, não em dado real: a função aborta e desfaz
-- tudo numa violação de constraint (transação implícita única) — nenhum
-- fulfillment_record chegou a existir, nenhuma linha órfã, nenhum dado parcial.
--
-- Aditiva e idempotente. NÃO exige UPDATE em nenhuma linha existente: as 5
-- linhas reais de fulfillment_records já são record_source='PDF_UPLOAD', com
-- danfe_file_path e label_file_path preenchidos e import_batch/import_ref
-- nulos — continuam batendo exatamente no mesmo ramo de cada constraint,
-- sem qualquer alteração de valor. Nenhum registro HISTORICAL_IMPORT ou
-- PDF_UPLOAD existente é convertido para XML_UPLOAD; XML_UPLOAD só nasce de
-- uma aprovação nova feita a partir de agora.
-- ============================================================================

-- ── 1. record_source: acrescenta XML_UPLOAD, mantém os dois valores atuais ──
alter table public.fulfillment_records
  drop constraint if exists fulfillment_records_record_source_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_record_source_check
  check (record_source in ('PDF_UPLOAD', 'HISTORICAL_IMPORT', 'XML_UPLOAD'));

-- ── 2. Documento exigido por origem — regra explícita, uma por valor, nunca ──
-- uma condição solta independente de record_source. PDF_UPLOAD continua
-- exigindo os dois PDFs (nada muda aqui); XML_UPLOAD exige xml_file_path;
-- um registro XML_UPLOAD com só PDFs (ou vice-versa) é rejeitado — a origem
-- declarada tem que bater com o documento que o registro realmente tem.
alter table public.fulfillment_records
  drop constraint if exists fulfillment_records_files_by_source_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_files_by_source_check
  check (
    (record_source = 'HISTORICAL_IMPORT')
    or (record_source = 'PDF_UPLOAD' and danfe_file_path is not null and label_file_path is not null)
    or (record_source = 'XML_UPLOAD' and xml_file_path is not null)
  );

-- ── 3. import_batch/import_ref: XML_UPLOAD segue a mesma regra de PDF_UPLOAD ──
-- (não é importação de planilha, os dois campos continuam nulos).
alter table public.fulfillment_records
  drop constraint if exists fulfillment_records_import_fields_check;
alter table public.fulfillment_records
  add constraint fulfillment_records_import_fields_check
  check (
    (record_source = 'HISTORICAL_IMPORT' and import_batch is not null and import_ref is not null)
    or (record_source in ('PDF_UPLOAD', 'XML_UPLOAD') and import_batch is null and import_ref is null)
  );

-- ── 4. approve_fulfillment_intake: define record_source explicitamente ──────
-- Resto do corpo idêntico à versão vigente (20261015100000): mesma validação,
-- mesmas colunas. Única mudança: record_source deixa de depender do DEFAULT
-- da coluna e passa a ser calculado a partir do documento realmente presente
-- na tentativa aprovada.
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
  v_record_source text;
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
  v_record_source := case when p_record->>'xml_file_path' is not null then 'XML_UPLOAD' else 'PDF_UPLOAD' end;

  insert into fulfillment_records (
    id, customer_name, customer_name_search, customer_cpf, customer_whatsapp,
    address_line, address_number, address_complement, neighborhood, postal_code, city, state,
    nfe_number, nfe_series, nfe_key, nfe_protocol, nfe_issued_at, items_count, invoice_total,
    carrier, shipping_service, tracking_code, shipping_label_date,
    sale_date, seller_id, sales_origin, delivery_status, status,
    danfe_file_path, label_file_path, xml_file_path, record_source, sale_total, payment_method, installments, created_by,
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
    p_record->>'danfe_file_path', p_record->>'label_file_path', p_record->>'xml_file_path', v_record_source,
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
