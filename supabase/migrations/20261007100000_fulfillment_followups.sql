-- ============================================================================
-- Follow-ups de pós-venda (aviso de envio, confirmação de entrega, avaliação
-- Google) como estado durável, separado da trilha de auditoria.
-- ============================================================================
-- PROPOSTA — NÃO APLICADA. Aguarda aprovação explícita.
--
-- Por que uma tabela nova, e não só a auditoria que já existe:
-- fulfillment_audit_logs é, de propósito, append-only e SEM texto de mensagem
-- (nunca PII). Mas "ENVIADO" agora precisa guardar o texto EXATO confirmado
-- (message_snapshot), para que o histórico não mude se o modelo da mensagem
-- mudar depois. Esse texto contém o nome da cliente — mesma sensibilidade que
-- fulfillment_records.customer_name, já visível só para Admin/Master — então
-- não pode ir para a auditoria. Fica numa tabela própria, com a mesma proteção.
--
-- Estado V1: OPEN ou SENT. COPIAR e ABRIR WHATSAPP nunca escrevem aqui — só
-- CONFIRMAR QUE ENVIEI. No máximo 1 linha por (registro, tipo).
-- ============================================================================

create table if not exists public.fulfillment_followups (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.fulfillment_records(id) on delete cascade,
  type text not null check (type in ('SHIPPING_NOTICE', 'DELIVERY_CONFIRMATION', 'GOOGLE_REVIEW')),
  status text not null default 'OPEN' check (status in ('OPEN', 'SENT')),
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  -- Texto exato confirmado como enviado. NULL em follow-ups confirmados antes desta
  -- migration (não existia onde guardar) — a UI avisa que é um registro antigo, nunca inventa o texto.
  message_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fulfillment_followups_sent_consistency check (
    (status = 'OPEN' and sent_at is null and sent_by is null)
    or (status = 'SENT' and sent_at is not null)
  ),
  unique (record_id, type)
);

create index if not exists fulfillment_followups_record_idx on public.fulfillment_followups (record_id);
create index if not exists fulfillment_followups_status_idx on public.fulfillment_followups (status);

alter table public.fulfillment_followups enable row level security;

drop policy if exists "fulfillment_followups_admin_select" on public.fulfillment_followups;
create policy "fulfillment_followups_admin_select" on public.fulfillment_followups
  for select using (is_admin());

drop policy if exists "fulfillment_followups_admin_insert" on public.fulfillment_followups;
create policy "fulfillment_followups_admin_insert" on public.fulfillment_followups
  for insert with check (is_admin());

drop policy if exists "fulfillment_followups_admin_update" on public.fulfillment_followups;
create policy "fulfillment_followups_admin_update" on public.fulfillment_followups
  for update using (is_admin()) with check (is_admin());

-- Sem policy de DELETE: nenhum papel apaga follow-up (nem o app tenta).

-- Least privilege, no mesmo padrão de 20261005241000 (pré-faturamento): remove
-- tudo de anon/authenticated/PUBLIC e devolve só o necessário. Sem DELETE,
-- TRUNCATE, TRIGGER nem REFERENCES para authenticated.
revoke all privileges on table public.fulfillment_followups from anon, authenticated, public;
grant select, insert, update on table public.fulfillment_followups to authenticated;

-- ── Criação automática: todo fulfillment_record ganha os 3 follow-ups, sempre OPEN.
create or replace function public.fulfillment_create_followups()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into fulfillment_followups (record_id, type)
  values
    (new.id, 'SHIPPING_NOTICE'),
    (new.id, 'DELIVERY_CONFIRMATION'),
    (new.id, 'GOOGLE_REVIEW')
  on conflict (record_id, type) do nothing;
  return new;
end;
$$;

drop trigger if exists fulfillment_records_create_followups on public.fulfillment_records;
create trigger fulfillment_records_create_followups
  after insert on public.fulfillment_records
  for each row execute function public.fulfillment_create_followups();

revoke all on function public.fulfillment_create_followups() from public, anon, authenticated;

-- ── Backfill 1/2: registros existentes ganham os 3 follow-ups, todos OPEN por padrão.
-- Idempotente (ON CONFLICT DO NOTHING) — pode rodar de novo sem efeito.
insert into fulfillment_followups (record_id, type)
select r.id, t.type
from fulfillment_records r
cross join (values ('SHIPPING_NOTICE'), ('DELIVERY_CONFIRMATION'), ('GOOGLE_REVIEW')) as t(type)
on conflict (record_id, type) do nothing;

-- ── Backfill 2/2: NÃO é heurística por horário, por delivery_status nem por cliente —
-- é uma leitura determinística e genérica da PRÓPRIA auditoria, vale para qualquer
-- registro, hoje ou no futuro. Só usa a ação *_CONFIRMED (confirmação explícita: o
-- antigo botão "CONFIRMAR QUE ENVIEI", que só gravava depois de um window.confirm
-- perguntando "Confirma que você já enviou esta mensagem pelo WhatsApp?"). NUNCA usa
-- *_WHATSAPP_OPENED (abrir a conversa não é prova de envio). Sem ID de cliente aqui:
-- o que aplicar esta migration encontrar na auditoria é o que vira SENT.
-- message_snapshot fica NULL: o texto exato nunca foi guardado nessa época.
--
-- PRIMEIRA confirmação, não a mais recente (order by created_at ASC, rn = 1): o sistema
-- antigo permitia reabrir depois de confirmado e confirmar de nova (ciclo de reenvio),
-- então um mesmo (registro, ação) podia, em tese, ter mais de um *_CONFIRMED. sent_at
-- deve representar quando o envio foi confirmado originalmente, não a repetição mais
-- recente.
with confirmed_events as (
  select
    record_id,
    case action
      when 'TRACKING_MESSAGE_CONFIRMED' then 'SHIPPING_NOTICE'
      when 'DELIVERY_CONFIRMATION_CONFIRMED' then 'DELIVERY_CONFIRMATION'
      when 'GOOGLE_REVIEW_CONFIRMED' then 'GOOGLE_REVIEW'
    end as type,
    actor_id,
    created_at,
    row_number() over (partition by record_id, action order by created_at asc) as rn
  from fulfillment_audit_logs
  where action in ('TRACKING_MESSAGE_CONFIRMED', 'DELIVERY_CONFIRMATION_CONFIRMED', 'GOOGLE_REVIEW_CONFIRMED')
)
update fulfillment_followups f
   set status = 'SENT', sent_at = c.created_at, sent_by = c.actor_id
  from confirmed_events c
 where c.rn = 1
   and f.record_id = c.record_id
   and f.type = c.type
   and f.status = 'OPEN';
