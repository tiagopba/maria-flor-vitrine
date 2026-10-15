-- ============================================================================
-- Edição administrativa (Admin/Master) dos dados de uma solicitação de
-- pré-faturamento, antes da aprovação — ATÔMICA.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Substitui a versão anterior deste mesmo arquivo (que só adicionava
-- 'INTAKE_EDITED' ao audit log genérico). O teste em Preview revelou um
-- requisito de integridade: a sequência "UPDATE da intake" + "INSERT do
-- audit log" feita pelo Server Action (duas chamadas separadas) podia
-- deixar o UPDATE salvo mesmo que o INSERT do audit falhasse (ex.: audit
-- log sem o valor 'INTAKE_EDITED' na constraint, como aconteceu no teste).
-- Isso não é aceitável para uma edição administrativa.
--
-- Esta versão move TODA a operação (checar permissão, checar status,
-- aplicar o UPDATE, calcular a invalidação de conferência, gravar o audit
-- log genérico e gravar o histórico privado de edição) para dentro de uma
-- ÚNICA função SECURITY DEFINER, `edit_fulfillment_intake`. Uma função
-- PL/pgSQL roda como uma única transação implícita: se qualquer `insert`
-- ou `raise exception` depois do `update` falhar, o Postgres desfaz TUDO
-- que a função já tinha feito (não só o INSERT que falhou) — não há
-- `exception when` nela que possa engolir o erro e deixar parte do
-- trabalho salva. O Server Action deixa de fazer UPDATE + INSERT em
-- chamadas separadas: só valida/normaliza com Zod (já existente,
-- inalterado) e chama esta função uma vez.
--
-- Aditiva: não apaga nada, não altera migration já aplicada, não altera
-- registros existentes. Tabela nova nasce vazia.
--
-- Revisão de segurança/integridade (antes da aplicação): `p_patch` agora
-- passa por whitelist explícita (passo 3 da função) — qualquer chave fora
-- das colunas administrativas permitidas é REJEITADA (não ignorada em
-- silêncio), os 8 campos "da venda" são sempre obrigatórios no patch, e os
-- 13 campos "da cliente" são tudo ou nada. "id", "status", "approved_record_id",
-- token/hash, timestamps de sistema, paths de documento e colunas de
-- auditoria nunca são lidos do patch em lugar nenhum da função — não têm
-- como ser alterados por este RPC.
-- ============================================================================

-- ── 1. Nova ação de auditoria (sem PII) ──────────────────────────────────────
alter table public.fulfillment_intake_audit_logs drop constraint if exists fulfillment_intake_audit_logs_action_check;
alter table public.fulfillment_intake_audit_logs
  add constraint fulfillment_intake_audit_logs_action_check check (action in (
    'INTAKE_CREATED', 'INTAKE_LINK_OPENED', 'INTAKE_DATA_RECEIVED', 'INTAKE_LINK_REOPENED',
    'INTAKE_CHECK_STARTED', 'INTAKE_BLOCKED', 'INTAKE_CHECK_RESTARTED', 'INTAKE_REVIEW_COMPLETED',
    'INTAKE_APPROVED', 'FULFILLMENT_CREATED', 'INTAKE_CANCELLED', 'INTAKE_EDITED'
  ));

-- ── 2. Histórico privado de edição administrativa (append-only) ─────────────
-- Guarda o motivo e, só para 'OTHER', a observação em texto livre — nunca no
-- audit log genérico (que fica só com nomes de campo + código do motivo).
-- Não guarda valor antigo/novo dos campos nesta V1 (não pedido; evita
-- duplicar PII em mais um lugar sem necessidade comprovada).
create table if not exists public.fulfillment_intake_edit_history (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.fulfillment_intakes(id),
  actor_id uuid,
  reason_code text not null check (reason_code in (
    'SALE_TYPO', 'CUSTOMER_REQUESTED_CORRECTION', 'NFE_ISSUANCE_CORRECTION', 'OTHER'
  )),
  -- Observação livre: só existe (e é obrigatória) quando o motivo é 'OTHER'.
  reason_note text check (reason_note is null or length(reason_note) between 1 and 280),
  constraint fulfillment_intake_edit_history_note_requires_other check (
    (reason_code = 'OTHER') = (reason_note is not null)
  ),
  fields_changed text[] not null check (array_length(fields_changed, 1) > 0),
  conference_invalidated boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists fulfillment_intake_edit_history_intake_idx
  on public.fulfillment_intake_edit_history (intake_id, created_at desc);

alter table public.fulfillment_intake_edit_history enable row level security;
revoke all on table public.fulfillment_intake_edit_history from anon;

-- Só Admin/Master leem o histórico (Operador/Funcionário nunca acessa esta
-- tabela, nem por chamada direta: RLS decide, não só a tela).
drop policy if exists "fulfillment_intake_edit_history_admin_select" on public.fulfillment_intake_edit_history;
create policy "fulfillment_intake_edit_history_admin_select" on public.fulfillment_intake_edit_history
  for select using (is_admin());

-- Sem policy de insert/update/delete para anon/authenticated: a única escrita
-- é a função SECURITY DEFINER abaixo (roda como dona da função, contorna RLS
-- do jeito já usado por approve_fulfillment_intake/cancel_fulfillment_intake).
revoke insert, update, delete on table public.fulfillment_intake_edit_history from anon, authenticated;
grant select on table public.fulfillment_intake_edit_history to authenticated;

-- ── 3. edit_fulfillment_intake: UPDATE + invalidação + auditoria, atômico ───
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
  -- Whitelist explícita: só estas colunas administrativas podem vir no patch.
  -- id, status, approved_record_id, token_hash/token_expires_at, submitted_at,
  -- cancelled_at/cancel_reason/cancel_note, created_at/updated_at e qualquer
  -- path de documento NUNCA aparecem aqui — não têm como ser alterados por
  -- este RPC, mesmo que alguém tente, porque a função nem lê essas chaves.
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
  -- 1. Permissão ANTES de qualquer leitura ou escrita (defesa real: mesmo uma
  -- chamada direta à função, sem passar pelo Server Action, é recusada aqui).
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

  -- 3. Whitelist do patch: rejeita (não ignora) qualquer chave fora da lista
  -- acima — inclusive "id", "status", "approved_record_id", token, paths de
  -- documento ou qualquer coluna de sistema. Os 8 campos "da venda" são
  -- sempre obrigatórios; os campos "da cliente" são tudo ou nada (nunca um
  -- patch com só 2 dos 13, que deixaria os outros 11 implicitamente
  -- inalterados sem o chamador saber).
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

  -- 5. Campos "da venda": a whitelist do passo 3 já garante que todos os 8 vêm no patch.
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

  -- 6. Campos "da cliente": v_has_customer_fields já foi decidido no passo 3
  -- (tudo ou nada, nunca pela presença de uma chave isolada).
  if v_has_customer_fields then
    if (p_patch->>'submitted_name') is distinct from v_intake.submitted_name then
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
    if (p_patch->>'submitted_recipient_name') is distinct from v_intake.submitted_recipient_name then
      v_fields := array_append(v_fields, 'submitted_recipient_name'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_postal_code') is distinct from v_intake.submitted_postal_code then
      v_fields := array_append(v_fields, 'submitted_postal_code'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_address_line') is distinct from v_intake.submitted_address_line then
      v_fields := array_append(v_fields, 'submitted_address_line'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_address_number') is distinct from v_intake.submitted_address_number then
      v_fields := array_append(v_fields, 'submitted_address_number'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_address_complement') is distinct from v_intake.submitted_address_complement then
      v_fields := array_append(v_fields, 'submitted_address_complement'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_neighborhood') is distinct from v_intake.submitted_neighborhood then
      v_fields := array_append(v_fields, 'submitted_neighborhood'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_city') is distinct from v_intake.submitted_city then
      v_fields := array_append(v_fields, 'submitted_city'); v_conference_affected := true;
    end if;
    if (p_patch->>'submitted_state') is distinct from v_intake.submitted_state then
      v_fields := array_append(v_fields, 'submitted_state'); v_conference_affected := true;
    end if;
  end if;

  -- 7. Nada mudou: não grava UPDATE nem histórico vazio.
  if array_length(v_fields, 1) is null then
    raise exception 'nenhum dado foi alterado';
  end if;

  -- 8. Invalidação da conferência: só força DATA_RECEIVED quando um campo que
  -- participa da comparação com o XML mudou E já existia uma tentativa
  -- (nunca sobe BLOCKED/REVIEW para GREEN sozinho; a tentativa antiga, em
  -- fulfillment_verification_attempts, nunca é tocada por esta função).
  v_next_status := v_intake.status;
  if v_conference_affected and v_intake.status in ('DOCUMENTS_PENDING', 'CHECKING', 'REVIEW_REQUIRED', 'BLOCKED') then
    v_next_status := 'DATA_RECEIVED';
  end if;

  -- 9. UPDATE. Só as colunas da whitelist (passo 3) são tocadas — id, status
  -- (aqui é sempre v_next_status, nunca o que viesse em p_patch, que nem tem
  -- essa chave por causa da whitelist), approved_record_id, token/hash,
  -- timestamps de sistema, paths de documento e colunas de auditoria nunca
  -- aparecem nesta instrução. Todas as constraints da tabela (STI3 único,
  -- pagamento válido, WhatsApp no formato certo, valor > 0 etc.) continuam
  -- valendo normalmente aqui — SECURITY DEFINER contorna RLS, nunca constraint.
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
  -- audit log acima). Mesma transação: se este INSERT falhar (ex.: violação
  -- de constraint), o UPDATE do passo 9 e o INSERT do passo 10 são desfeitos
  -- também — não existe "meio caminho" salvo.
  insert into fulfillment_intake_edit_history (intake_id, actor_id, reason_code, reason_note, fields_changed, conference_invalidated)
  values (p_intake, v_actor, p_reason_code, p_reason_note, v_fields, v_next_status <> v_intake.status);

  return jsonb_build_object('status', v_next_status, 'fields', to_jsonb(v_fields));
end;
$$;

-- Privilégios: só authenticated pode executar; anon e PUBLIC não. A checagem
-- is_admin() dentro da função continua recusando authenticated não-admin.
revoke all on function public.edit_fulfillment_intake(uuid, jsonb, text, text) from public, anon;
grant execute on function public.edit_fulfillment_intake(uuid, jsonb, text, text) to authenticated;
