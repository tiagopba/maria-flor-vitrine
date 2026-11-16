-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário.
-- ============================================================================
-- Histórico de avaliação (Google) POR CLIENTE — não por venda.
-- Depende de 20261116100000_fulfillment_customers.sql (customers).
--
-- Por que uma tabela nova e não reaproveitar fulfillment_followups: aquela
-- tabela é, de propósito, por VENDA (1 linha por (record_id, type)) — é
-- exatamente onde mora o bug relatado ("cliente que já avaliou numa compra
-- recebe pedido de novo na próxima"). Esta tabela nova resolve isso guardando
-- o estado no nível de CLIENTE; fulfillment_followups continua existindo
-- e funcionando IDENTICAMENTE para tracking/delivery (nunca alterada aqui) e
-- para o GOOGLE_REVIEW de cada venda (nenhuma linha é apagada ou migrada —
-- ver backfill abaixo). A ligação entre os dois níveis (usar
-- customer_review_status pra decidir se o GOOGLE_REVIEW de uma venda NOVA
-- nasce acionável) é lógica de aplicação/trigger da Fase 3 — não faz parte
-- desta migration.
--
-- 5 estados pedidos: NEVER_ASKED, REQUESTED, REVIEWED, DISMISSED,
-- DOES_NOT_WANT. "Dispensada" (DISMISSED) é reversível numa venda futura;
-- "Cliente não deseja receber" (DOES_NOT_WANT) é a única condição permanente
-- de bloqueio.
-- ============================================================================

-- Transação explícita, mesmo princípio do arquivo anterior.
begin;

create table if not exists public.customer_review_status (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  status text not null default 'NEVER_ASKED'
    check (status in ('NEVER_ASKED', 'REQUESTED', 'REVIEWED', 'DISMISSED', 'DOES_NOT_WANT')),
  last_requested_at timestamptz,
  -- Qual venda gerou o pedido mais recente — só informativo (nunca decide
  -- sozinho se pode pedir de novo; isso é sempre pela coluna status).
  last_requested_sale_id uuid references public.fulfillment_records(id) on delete set null,
  reviewed_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists customer_review_status_set_updated_at on public.customer_review_status;
create trigger customer_review_status_set_updated_at
  before update on public.customer_review_status
  for each row execute function public.set_updated_at();

alter table public.customer_review_status enable row level security;
revoke all on table public.customer_review_status from anon;

drop policy if exists "customer_review_status_admin_all" on public.customer_review_status;
create policy "customer_review_status_admin_all" on public.customer_review_status
  for all using (is_admin()) with check (is_admin());

revoke all privileges on table public.customer_review_status from anon, authenticated, public;
grant select, insert, update on table public.customer_review_status to authenticated;

-- ── Trilha de auditoria (append-only, mesmo padrão de fulfillment_audit_logs).
create table if not exists public.customer_review_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  -- Venda relacionada ao evento, quando houver (nunca obrigatória: um RESET
  -- manual, por exemplo, pode não estar ligado a nenhuma venda específica).
  sale_id uuid references public.fulfillment_records(id) on delete set null,
  action text not null check (action in ('REQUESTED', 'REVIEWED', 'DISMISSED', 'DOES_NOT_WANT', 'REOPENED')),
  -- NULL só nos eventos de backfill desta migration (ação do sistema, nunca
  -- de uma pessoa) — nunca em eventos gerados pelo app depois.
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_review_events_customer_idx
  on public.customer_review_events (customer_id, created_at desc);

alter table public.customer_review_events enable row level security;
revoke all on table public.customer_review_events from anon;

drop policy if exists "customer_review_events_admin_select" on public.customer_review_events;
create policy "customer_review_events_admin_select" on public.customer_review_events
  for select using (is_admin());

drop policy if exists "customer_review_events_admin_insert" on public.customer_review_events;
create policy "customer_review_events_admin_insert" on public.customer_review_events
  for insert with check (is_admin());

-- Sem policy de UPDATE/DELETE: append-only, igual fulfillment_audit_logs.
revoke all privileges on table public.customer_review_events from anon, authenticated, public;
grant select, insert on table public.customer_review_events to authenticated;

-- ============================================================================
-- Backfill — regra central (pedida explicitamente): um fulfillment_followups
-- (GOOGLE_REVIEW, status=SENT) historicamente só prova que a LOJA confirmou
-- TER ENVIADO o pedido de avaliação — nunca que a cliente respondeu ou
-- avaliou de fato. Por isso o backfill NUNCA cria ninguém como REVIEWED:
-- só REQUESTED (quando existe pelo menos 1 SENT em alguma venda dela) ou
-- NEVER_ASKED (quando não existe nenhum). Promover alguém pra REVIEWED é
-- sempre uma ação manual e explícita de uma vendedora, feita depois, na
-- Fase 3/4 — nunca inferida daqui.
-- ============================================================================

-- 1/3: clientes com pelo menos 1 GOOGLE_REVIEW já SENT (em qualquer venda
-- dela) nascem REQUESTED, com o SENT mais recente como referência.
insert into public.customer_review_status (customer_id, status, last_requested_at, last_requested_sale_id)
select
  c.id,
  'REQUESTED',
  latest.sent_at,
  latest.record_id
from public.customers c
join lateral (
  select fu.record_id, fu.sent_at
  from public.fulfillment_followups fu
  join public.fulfillment_records rec on rec.id = fu.record_id
  where rec.customer_id = c.id
    and fu.type = 'GOOGLE_REVIEW'
    and fu.status = 'SENT'
  order by fu.sent_at desc
  limit 1
) latest on true
on conflict (customer_id) do nothing;

-- 2/3: os demais clientes (sem nenhum SENT) nascem NEVER_ASKED.
insert into public.customer_review_status (customer_id, status)
select c.id, 'NEVER_ASKED'
from public.customers c
on conflict (customer_id) do nothing;

-- 3/3: um evento de auditoria por cliente que nasceu REQUESTED no backfill
-- (actor_id NULL de propósito — ação do sistema, não de uma pessoa).
-- Guard "not exists" obrigatório pra idempotência: customer_review_events é
-- append-only (sem unique, de propósito — uma cliente real pode ganhar
-- REQUESTED mais de uma vez ao longo do tempo, em ações futuras do app).
-- Sem este guard, reexecutar esta migration (os `create table if not
-- exists` acima não impedem o restante do arquivo de rodar de novo) faria
-- este INSERT duplicar 1 evento de backfill por cliente a cada reexecução.
-- Só insere pra quem ainda não tem NENHUM evento — ou seja, só na primeira
-- aplicação de verdade.
insert into public.customer_review_events (customer_id, sale_id, action, actor_id)
select s.customer_id, s.last_requested_sale_id, 'REQUESTED', null
from public.customer_review_status s
where s.status = 'REQUESTED'
  and not exists (
    select 1 from public.customer_review_events e
    where e.customer_id = s.customer_id
  );

commit;
