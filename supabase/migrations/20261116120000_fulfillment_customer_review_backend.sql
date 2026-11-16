-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: Preview e Production compartilham o mesmo banco).
-- ============================================================================
-- Fase 3 do módulo "cliente por CPF + avaliação global" — backend:
--   1) Vínculo automático de cliente em TODA venda nova (trigger — cobre
--      cadastro manual, aprovação de pré-faturamento e importação histórica,
--      porque os três só fazem `insert into fulfillment_records`, nunca
--      setam customer_id sozinhos).
--   2) Confirmação de "pedi avaliação" passa a ser atômica (follow-up da
--      VENDA + estado GLOBAL da cliente + evento de auditoria, tudo ou nada
--      — mesma lição já aplicada em edit_fulfillment_intake: nunca duas
--      chamadas separadas pra uma operação logicamente única).
--   3) Função separada e só-manual pra marcar REVIEWED/DISMISSED/DOES_NOT_WANT
--      (nunca automática — só uma vendedora/admin decide).
--
-- Aditiva: não altera fulfillment_followups, não altera
-- fulfillment_create_followups() (continua criando os 3 follow-ups sempre,
-- sempre OPEN — "avaliação não elegível" é decidido na LEITURA, comparando
-- com customer_review_status, nunca um 4º status gravado na linha da venda).
-- Não apaga nenhum registro existente.
-- ============================================================================

begin;

-- ── 1. Vínculo automático de cliente ────────────────────────────────────────
-- BEFORE INSERT: se a venda já tem um CPF com dígito verificador válido
-- (is_valid_cpf, da migration 20261116100000) e ainda não veio com
-- customer_id explícito, resolve (ou cria) o customer e seta NEW.customer_id
-- antes da linha ser gravada. Sem CPF confiável: customer_id fica NULL,
-- exatamente como hoje (nenhuma venda é bloqueada por isso).
--
-- "on conflict ... do update set cpf_digits = excluded.cpf_digits" é um
-- UPDATE de propósito inócuo (grava a coluna no próprio valor que já tinha)
-- só para garantir que o RETURNING sempre devolva uma linha (ON CONFLICT DO
-- NOTHING não devolve nada no caso de conflito) — display_name NUNCA é
-- tocado aqui, de propósito: uma venda nova nunca sobrescreve o nome já
-- salvo da cliente.
create or replace function public.fulfillment_resolve_customer()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  if new.customer_id is not null then
    return new;
  end if;
  if new.customer_cpf is null or new.customer_cpf !~ '^[0-9]{11}$' or not is_valid_cpf(new.customer_cpf) then
    return new;
  end if;

  insert into customers (cpf_digits, display_name)
  values (new.customer_cpf, new.customer_name)
  on conflict (cpf_digits) do update set cpf_digits = excluded.cpf_digits
  returning id into v_customer_id;

  -- Toda cliente precisa de uma linha em customer_review_status (invariante
  -- já valendo pro backfill da migration 20261116110000) — sem isto, uma
  -- cliente NOVA (criada por este trigger, não pelo backfill) nunca teria
  -- linha nenhuma lá, e confirm_google_review_sent/set_customer_review_outcome
  -- falhariam por "não encontrada" na primeira venda dela. NEVER_ASKED é o
  -- único status de partida possível aqui — nunca inventa histórico.
  insert into customer_review_status (customer_id)
  values (v_customer_id)
  on conflict (customer_id) do nothing;

  new.customer_id := v_customer_id;
  return new;
end;
$$;

revoke all on function public.fulfillment_resolve_customer() from public, anon, authenticated;

drop trigger if exists fulfillment_records_resolve_customer on public.fulfillment_records;
create trigger fulfillment_records_resolve_customer
  before insert on public.fulfillment_records
  for each row execute function public.fulfillment_resolve_customer();

-- ── 2. Confirmar "pedi avaliação" — atômico (follow-up + estado global) ─────
-- Substitui, só para o tipo GOOGLE_REVIEW, o UPDATE solto que
-- confirmFollowupSent faz hoje (que continua valendo, sem mudança, para
-- SHIPPING_NOTICE/DELIVERY_CONFIRMATION — nenhuma regra de rastreio/entrega
-- é tocada aqui).
--
-- Bloqueia (revalidando sempre no servidor, nunca confiando em estado que
-- a tela já tinha antes de clicar):
--   - cliente sem customer_id (sem CPF confiável): segue liberado, igual hoje
--     (comportamento inalterado pra quem não tem vínculo).
--   - REQUESTED ou REVIEWED: nunca permite pedir de novo.
--   - DOES_NOT_WANT: nunca permite (bloqueio permanente, igual REVIEWED).
--   - DISMISSED/NEVER_ASKED: libera normalmente (dispensa é reversível numa
--     venda futura, por desenho).
-- "for update" na linha de customer_review_status trava a cliente inteira
-- durante a transação — duas tentativas simultâneas (mesma cliente, vendas
-- diferentes ou a mesma) nunca passam as duas: a segunda só segue depois da
-- primeira commitar, e aí já vê o novo status e é rejeitada.
create or replace function public.confirm_google_review_sent(
  p_record_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_record fulfillment_records%rowtype;
  v_review_status text;
  v_rows int;
begin
  if not is_admin() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_message is null or length(btrim(p_message)) = 0 then
    raise exception 'mensagem vazia';
  end if;

  select * into v_record from fulfillment_records where id = p_record_id for update;
  if not found then
    raise exception 'registro não encontrado';
  end if;

  -- Idempotente, e verificado ANTES de qualquer checagem de estado global:
  -- um clique duplicado no MESMO follow-up (já SENT) nunca deve ser tratado
  -- como "pedir de novo" — não muda nada, então nem olha pro estado da
  -- cliente, só devolve written=false. Só quando a transição OPEN→SENT
  -- realmente acontece agora é que seguimos pro estado global abaixo — e,
  -- se o bloqueio disparar dali pra frente, o `raise exception` desfaz
  -- também este UPDATE (mesma transação da função inteira).
  update fulfillment_followups
     set status = 'SENT', sent_at = now(), sent_by = v_actor, message_snapshot = p_message
   where record_id = p_record_id and type = 'GOOGLE_REVIEW' and status = 'OPEN';
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('written', false);
  end if;

  if v_record.customer_id is not null then
    select status into v_review_status
      from customer_review_status
     where customer_id = v_record.customer_id
       for update;

    if v_review_status in ('REQUESTED', 'REVIEWED', 'DOES_NOT_WANT') then
      raise exception 'esta cliente já tem avaliação solicitada, recebida, ou não deseja receber — não é possível pedir de novo'
        using errcode = '23514';
    end if;

    update customer_review_status
       set status = 'REQUESTED',
           last_requested_at = now(),
           last_requested_sale_id = p_record_id,
           updated_by = v_actor
     where customer_id = v_record.customer_id;

    insert into customer_review_events (customer_id, sale_id, action, actor_id)
    values (v_record.customer_id, p_record_id, 'REQUESTED', v_actor);
  end if;

  return jsonb_build_object('written', true);
end;
$$;

revoke all on function public.confirm_google_review_sent(uuid, text) from public, anon;
grant execute on function public.confirm_google_review_sent(uuid, text) to authenticated;

-- ── 3. Marcar resultado da avaliação — sempre ação humana explícita ─────────
-- Nunca chamada automaticamente por nenhum trigger ou fluxo — só por um
-- clique real de Admin/Master na tela (Fase 4). REVIEWED só sai daqui;
-- não existe nenhum outro caminho no banco que grave esse status.
create or replace function public.set_customer_review_outcome(
  p_customer_id uuid,
  p_outcome text,
  p_sale_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_rows int;
begin
  if not is_admin() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_outcome not in ('REVIEWED', 'DISMISSED', 'DOES_NOT_WANT') then
    raise exception 'resultado inválido: %', p_outcome;
  end if;

  update customer_review_status
     set status = p_outcome,
         reviewed_at = case when p_outcome = 'REVIEWED' then now() else reviewed_at end,
         updated_by = v_actor
   where customer_id = p_customer_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'cliente não encontrada';
  end if;

  insert into customer_review_events (customer_id, sale_id, action, actor_id)
  values (p_customer_id, p_sale_id, p_outcome, v_actor);

  return jsonb_build_object('status', p_outcome);
end;
$$;

revoke all on function public.set_customer_review_outcome(uuid, text, uuid) from public, anon;
grant execute on function public.set_customer_review_outcome(uuid, text, uuid) to authenticated;

commit;
