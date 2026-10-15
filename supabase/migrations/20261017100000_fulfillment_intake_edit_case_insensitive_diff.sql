-- ============================================================================
-- edit_fulfillment_intake: diferença de CAIXA sozinha não conta como mudança.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Achado no teste real da Arielle: a edição mudou só sale_total, mas como os
-- dados antigos dela estavam em mixed case (enviados antes do fix de CAIXA
-- ALTA do formulário público) e o formulário de edição sempre reenvia o
-- bloco "dados da cliente" inteiro já normalizado, o audit log registrou
-- também submitted_name, submitted_address_line, submitted_address_complement,
-- submitted_neighborhood e submitted_city como "alterados" — ruído de
-- auditoria: nome, rua, complemento, bairro e cidade continuavam
-- SEMANTICAMENTE os mesmos, só a caixa mudou (ex.: "Itapaci" → "ITAPACI").
--
-- `create or replace function` sobre a função já aplicada em
-- 20261016100000_fulfillment_intake_admin_edit.sql (não a edita; substitui
-- só o corpo, mesma assinatura). Única mudança: os 7 campos que o Admin edita
-- e que o Zod normaliza para CAIXA ALTA (submitted_name, submitted_recipient_name,
-- submitted_address_line, submitted_address_complement, submitted_neighborhood,
-- submitted_city, submitted_state) agora comparam com `upper(...) is distinct
-- from upper(...)` em vez de comparação sensível a caixa. Resultado:
--   - o banco continua gravando o valor em CAIXA ALTA normalmente (o UPDATE
--     não muda: grava sempre o que veio no patch);
--   - mas se a ÚNICA diferença para o valor já salvo for a caixa, a coluna
--     NÃO entra em fields_changed, NÃO aparece no audit log nem no histórico
--     privado, e NÃO invalida a conferência sozinha.
-- Os outros campos (sti3_sale_id, customer_name — "cliente" não é CAIXA ALTA
-- por decisão anterior —, customer_whatsapp, seller_id, sale_date, sale_total,
-- payment_method, internal_notes, submitted_cpf, submitted_email,
-- submitted_whatsapp, submitted_postal_code, submitted_address_number,
-- submitted_delivery_to_customer) continuam com a comparação exata de antes —
-- não são normalizados para CAIXA ALTA, então uma diferença de caixa neles
-- (se existir) continua sendo uma mudança real.
--
-- Não retroage: a edição já feita na Arielle (histórico e audit log já
-- gravados) NÃO é reescrita. Vale só para chamadas novas, a partir de agora.
-- Não altera whitelist, permissão, status, atomicidade, RLS nem grants —
-- só o critério de "o que conta como mudança" para estas 7 colunas.
-- ============================================================================

create or replace function public.edit_fulfillment_intake(
  p_intake uuid,
  p_patch jsonb,
  p_reason_code text,
  p_reason_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intake fulfillment_intakes%rowtype;
  v_actor uuid := auth.uid();
  v_fields text[] := '{}';
  v_conference_affected boolean := false;
  v_next_status text;
  v_new_sale_total numeric;
  v_new_delivery_to_customer boolean;
  v_has_customer_fields boolean;
  v_sale_keys text[] := array[
    'sti3_sale_id', 'customer_name', 'customer_whatsapp', 'seller_id',
    'sale_date', 'sale_total', 'payment_method', 'internal_notes'
  ];
  v_customer_keys text[] := array[
    'submitted_name', 'submitted_cpf', 'submitted_email', 'submitted_whatsapp',
    'submitted_delivery_to_customer', 'submitted_recipient_name', 'submitted_postal_code',
    'submitted_address_line', 'submitted_address_number', 'submitted_address_complement',
    'submitted_neighborhood', 'submitted_city', 'submitted_state'
  ];
  v_key text;
  v_customer_keys_present integer;
begin
  -- 1. Permissão ANTES de qualquer leitura ou escrita.
  if not is_admin() then
    raise exception 'sem permissão para editar' using errcode = '42501';
  end if;

  -- 2. Motivo: código fechado; observação só existe (e é obrigatória) com 'OTHER'.
  if p_reason_code not in ('SALE_TYPO', 'CUSTOMER_REQUESTED_CORRECTION', 'NFE_ISSUANCE_CORRECTION', 'OTHER') then
    raise exception 'motivo de edição inválido';
  end if;
  if p_reason_code = 'OTHER' then
    if p_reason_note is null or length(btrim(p_reason_note)) = 0 then
      raise exception 'explique o motivo em uma frase curta';
    end if;
    if length(p_reason_note) > 280 then
      raise exception 'a observação pode ter no máximo 280 caracteres';
    end if;
  elsif p_reason_note is not null then
    raise exception 'observação só é aceita para o motivo Outro';
  end if;

  -- 3. Whitelist do patch: rejeita (não ignora) qualquer chave fora da lista.
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_sale_keys) or v_key = any(v_customer_keys)) then
      raise exception 'campo não permitido nesta edição: %', v_key using errcode = '22023';
    end if;
  end loop;
  for v_key in select unnest(v_sale_keys) loop
    if not (p_patch ? v_key) then
      raise exception 'campo obrigatório ausente: %', v_key;
    end if;
  end loop;
  select count(*) into v_customer_keys_present from unnest(v_customer_keys) k where p_patch ? k;
  if v_customer_keys_present > 0 and v_customer_keys_present < array_length(v_customer_keys, 1) then
    raise exception 'dados da cliente incompletos no patch';
  end if;
  v_has_customer_fields := v_customer_keys_present = array_length(v_customer_keys, 1);

  -- 4. Trava a linha e confere o estado atual (nunca aprovada nem cancelada).
  select * into v_intake from fulfillment_intakes where id = p_intake for update;
  if not found then
    raise exception 'solicitação não encontrada';
  end if;
  if v_intake.status in ('APPROVED', 'CANCELLED') then
    raise exception 'esta solicitação já foi aprovada ou cancelada e não pode ser editada';
  end if;

  -- 5. Campos "da venda": nenhum destes é normalizado para CAIXA ALTA pelo
  -- Zod, então a comparação continua sensível a caixa (igual antes).
  if (p_patch->>'sti3_sale_id') is distinct from v_intake.sti3_sale_id then
    v_fields := array_append(v_fields, 'sti3_sale_id');
  end if;
  if (p_patch->>'customer_name') is distinct from v_intake.customer_name then
    v_fields := array_append(v_fields, 'customer_name');
  end if;
  if (p_patch->>'customer_whatsapp') is distinct from v_intake.customer_whatsapp then
    v_fields := array_append(v_fields, 'customer_whatsapp');
  end if;
  if (p_patch->>'seller_id')::uuid is distinct from v_intake.seller_id then
    v_fields := array_append(v_fields, 'seller_id');
  end if;
  if (p_patch->>'sale_date')::date is distinct from v_intake.sale_date then
    v_fields := array_append(v_fields, 'sale_date');
  end if;
  v_new_sale_total := (p_patch->>'sale_total')::numeric;
  if v_new_sale_total is distinct from v_intake.sale_total then
    v_fields := array_append(v_fields, 'sale_total');
    v_conference_affected := true;
  end if;
  if (p_patch->>'payment_method') is distinct from v_intake.payment_method then
    v_fields := array_append(v_fields, 'payment_method');
  end if;
  if (p_patch->>'internal_notes') is distinct from v_intake.internal_notes then
    v_fields := array_append(v_fields, 'internal_notes');
  end if;

  -- 6. Campos "da cliente". submitted_cpf/email/whatsapp/postal_code/address_number
  -- e delivery_to_customer não são CAIXA ALTA: comparação exata, como antes.
  -- submitted_name/recipient_name/address_line/address_complement/neighborhood/
  -- city/state SÃO normalizados para CAIXA ALTA pelo Zod — aqui comparam por
  -- upper(...), então uma diferença só de caixa não conta como mudança.
  if v_has_customer_fields then
    if upper(p_patch->>'submitted_name') is distinct from upper(v_intake.submitted_name) then
      v_fields := array_append(v_fields, 'submitted_name'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_cpf') is distinct from v_intake.submitted_cpf then
      v_fields := array_append(v_fields, 'submitted_cpf'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_email') is distinct from v_intake.submitted_email then
      v_fields := array_append(v_fields, 'submitted_email');
    end if;
    if (p_patch->>'submitted_whatsapp') is distinct from v_intake.submitted_whatsapp then
      v_fields := array_append(v_fields, 'submitted_whatsapp');
    end if;
    v_new_delivery_to_customer := (p_patch->>'submitted_delivery_to_customer')::boolean;
    if v_new_delivery_to_customer is distinct from v_intake.submitted_delivery_to_customer then
      v_fields := array_append(v_fields, 'submitted_delivery_to_customer'); v_conference_affected := true;
    end if;
    if upper(p_patch->>'submitted_recipient_name') is distinct from upper(v_intake.submitted_recipient_name) then
      v_fields := array_append(v_fields, 'submitted_recipient_name'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_postal_code') is distinct from v_intake.submitted_postal_code then
      v_fields := array_append(v_fields, 'submitted_postal_code'); v_conference_affected := true;
    end if;
    if upper(p_patch->>'submitted_address_line') is distinct from upper(v_intake.submitted_address_line) then
      v_fields := array_append(v_fields, 'submitted_address_line'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_address_number') is distinct from v_intake.submitted_address_number then
      v_fields := array_append(v_fields, 'submitted_address_number'); v_conference_affected := true;
    end if;
    if upper(p_patch->>'submitted_address_complement') is distinct from upper(v_intake.submitted_address_complement) then
      v_fields := array_append(v_fields, 'submitted_address_complement'); v_conference_affected := true;
    end if;
    if upper(p_patch->>'submitted_neighborhood') is distinct from upper(v_intake.submitted_neighborhood) then
      v_fields := array_append(v_fields, 'submitted_neighborhood'); v_conference_affected := true;
    end if;
    if upper(p_patch->>'submitted_city') is distinct from upper(v_intake.submitted_city) then
      v_fields := array_append(v_fields, 'submitted_city'); v_conference_affected := true;
    end if;
    if upper(p_patch->>'submitted_state') is distinct from upper(v_intake.submitted_state) then
      v_fields := array_append(v_fields, 'submitted_state'); v_conference_affected := true;
    end if;
  end if;

  -- 7. Nada mudou (de verdade — ignorando diferença só de caixa nos 7 campos
  -- acima): não grava UPDATE nem histórico vazio.
  if array_length(v_fields, 1) is null then
    raise exception 'nenhum dado foi alterado';
  end if;

  -- 8. Invalidação da conferência: só força DATA_RECEIVED quando um campo que
  -- participa da comparação com o XML mudou DE VERDADE (não só de caixa) E já
  -- existia uma tentativa.
  v_next_status := v_intake.status;
  if v_conference_affected and v_intake.status in ('DOCUMENTS_PENDING', 'CHECKING', 'REVIEW_REQUIRED', 'BLOCKED') then
    v_next_status := 'DATA_RECEIVED';
  end if;

  -- 9. UPDATE: grava sempre o valor normalizado que veio no patch (CAIXA
  -- ALTA inclusive), mesmo quando a diferença de caixa não contou como
  -- "mudança" acima — o banco fica com o texto já normalizado de qualquer
  -- forma, só a AUDITORIA que não registra isso como campo corrigido.
  update fulfillment_intakes set
    sti3_sale_id = p_patch->>'sti3_sale_id',
    customer_name = p_patch->>'customer_name',
    customer_whatsapp = p_patch->>'customer_whatsapp',
    seller_id = (p_patch->>'seller_id')::uuid,
    sale_date = (p_patch->>'sale_date')::date,
    sale_total = v_new_sale_total,
    payment_method = p_patch->>'payment_method',
    internal_notes = p_patch->>'internal_notes',
    submitted_name = case when v_has_customer_fields then p_patch->>'submitted_name' else submitted_name end,
    submitted_cpf = case when v_has_customer_fields then p_patch->>'submitted_cpf' else submitted_cpf end,
    submitted_email = case when v_has_customer_fields then p_patch->>'submitted_email' else submitted_email end,
    submitted_whatsapp = case when v_has_customer_fields then p_patch->>'submitted_whatsapp' else submitted_whatsapp end,
    submitted_delivery_to_customer = case when v_has_customer_fields then v_new_delivery_to_customer else submitted_delivery_to_customer end,
    submitted_recipient_name = case when v_has_customer_fields then p_patch->>'submitted_recipient_name' else submitted_recipient_name end,
    submitted_postal_code = case when v_has_customer_fields then p_patch->>'submitted_postal_code' else submitted_postal_code end,
    submitted_address_line = case when v_has_customer_fields then p_patch->>'submitted_address_line' else submitted_address_line end,
    submitted_address_number = case when v_has_customer_fields then p_patch->>'submitted_address_number' else submitted_address_number end,
    submitted_address_complement = case when v_has_customer_fields then p_patch->>'submitted_address_complement' else submitted_address_complement end,
    submitted_neighborhood = case when v_has_customer_fields then p_patch->>'submitted_neighborhood' else submitted_neighborhood end,
    submitted_city = case when v_has_customer_fields then p_patch->>'submitted_city' else submitted_city end,
    submitted_state = case when v_has_customer_fields then p_patch->>'submitted_state' else submitted_state end,
    status = v_next_status,
    updated_at = now()
  where id = p_intake;

  -- 10. Audit log genérico: só nomes de campo, código do motivo e o booleano
  -- de invalidação — nunca nome, CPF, endereço, telefone, e-mail, valores
  -- antigos/novos nem a observação de 'OTHER'.
  insert into fulfillment_intake_audit_logs (intake_id, action, actor_id, details)
  values (
    p_intake, 'INTAKE_EDITED', v_actor,
    jsonb_build_object('fields', to_jsonb(v_fields), 'reason', p_reason_code, 'conferenceInvalidated', v_next_status <> v_intake.status)
  );

  -- 11. Histórico privado: guarda a observação de 'OTHER' (só aqui, nunca no
  -- audit log acima). Mesma transação: se este INSERT falhar, o UPDATE do
  -- passo 9 e o INSERT do passo 10 são desfeitos também.
  insert into fulfillment_intake_edit_history (intake_id, actor_id, reason_code, reason_note, fields_changed, conference_invalidated)
  values (p_intake, v_actor, p_reason_code, p_reason_note, v_fields, v_next_status <> v_intake.status);

  return jsonb_build_object('status', v_next_status, 'fields', to_jsonb(v_fields));
end;
$$;

-- Privilégios: sem mudança (mesma assinatura, create or replace preserva o
-- que já foi concedido/revogado em 20261016100000; reafirmado aqui por
-- clareza, não por necessidade).
revoke all on function public.edit_fulfillment_intake(uuid, jsonb, text, text) from public, anon;
grant execute on function public.edit_fulfillment_intake(uuid, jsonb, text, text) to authenticated;
