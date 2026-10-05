-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- (regra do projeto: Preview e Production compartilham o mesmo banco).
-- ============================================================================
-- Módulo "Faturamento e Envios": registro de DANFE simplificado + etiqueta de
-- envio por pedido, com os PDFs guardados em bucket PRIVADO.
--
-- Reaproveita a tabela de vendedoras já existente (public.sellers) por FK — não cria outra.
-- Totalmente isolado: cria só objetos NOVOS (2 tabelas + 1 bucket + policies).
-- Não altera, não referencia e não remove nada de produtos, carrinho,
-- analytics, leads ou qualquer outro módulo. Nenhum DROP/TRUNCATE/DELETE de
-- dados existentes. Idempotente: pode rodar mais de uma vez.
--
-- Dados pessoais (nome, CPF, endereço): ficam SOMENTE aqui. Nunca vão para
-- analytics_events, Pixel/CAPI, localStorage nem logs.
--
-- Acesso: só is_admin() (admin e master — mesma função que já protege
-- Configurações). Sem NENHUMA policy para anon/authenticated genérico: o
-- público não lê, não lista e não insere. Os privilégios de anon também são
-- revogados explicitamente (cinto + suspensório sobre a RLS).
--
-- Auditoria: não existia `audit_logs` no projeto, então este módulo traz a
-- sua própria `fulfillment_audit_logs` (append-only: só policy de select e
-- insert, nenhuma de update/delete). `details` guarda só metadados — nunca
-- valores de CPF/nome/endereço.
-- ============================================================================

create table if not exists public.fulfillment_records (
  id uuid primary key default gen_random_uuid(),

  -- Cliente
  customer_name text not null check (length(btrim(customer_name)) > 0),
  -- Só dígitos: 11 (CPF) ou 14 (CNPJ). Formatação/máscara é só de exibição.
  customer_cpf text check (customer_cpf ~ '^[0-9]{11}([0-9]{3})?$'),
  -- Nome sem acento/caixa/pontuação, calculado pelo app, só para busca.
  customer_name_search text not null default '',

  -- Endereço
  address_line text,
  address_number text,
  address_complement text,
  neighborhood text,
  postal_code text check (postal_code ~ '^[0-9]{8}$'),
  city text,
  state text check (state ~ '^[A-Z]{2}$'),

  -- NF-e
  nfe_number text,
  nfe_series text,
  nfe_key text check (nfe_key ~ '^[0-9]{44}$'),
  nfe_protocol text,
  nfe_issued_at date,
  items_count integer check (items_count >= 0),
  invoice_total numeric(12,2) check (invoice_total >= 0),

  -- Envio
  carrier text,
  -- Ex: 'SEDEX', 'PAC' (Correios). Vazio quando a transportadora não tem serviço no texto da etiqueta (ex: J&T).
  shipping_service text,
  tracking_code text,
  shipping_label_date timestamptz,

  -- Venda e entrega (controle operacional — substitui a planilha de envios)
  -- Data da venda: independente da emissão da NF-e.
  sale_date date,
  -- Vendedora conhecida → seller_id (reaproveita public.sellers; nunca uma nova
  -- tabela). ONLINE (ou outra origem que não seja uma vendedora) → seller_id
  -- nulo + sales_origin. Vendedora desconhecida → os dois nulos (a interface
  -- mostra "Vendedora não informada"; NÃO existe vendedora/origem fictícia).
  seller_id uuid references public.sellers(id) on delete set null,
  sales_origin text,
  expected_delivery_date date,
  delivered_at date,
  -- Situação LOGÍSTICA — separada de `status` (que é só "registro confirmado").
  delivery_status text not null default 'PENDING'
    check (delivery_status in ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'RESENT', 'REFUNDED', 'DELIVERY_ISSUE')),
  notes text,

  -- Arquivos (caminhos dentro do bucket privado 'fulfillment-documents')
  danfe_file_path text not null,
  label_file_path text not null,

  -- Sem workflow por enquanto: todo registro nasce CONFIRMED.
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED')),

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Vendedora OU origem, nunca os dois.
  constraint fulfillment_records_seller_or_origin_check
    check (seller_id is null or sales_origin is null),
  constraint fulfillment_records_sales_origin_not_blank_check
    check (sales_origin is null or length(btrim(sales_origin)) > 0)
);

create index if not exists fulfillment_records_created_at_idx
  on public.fulfillment_records (created_at desc);
create index if not exists fulfillment_records_customer_cpf_idx
  on public.fulfillment_records (customer_cpf);
create index if not exists fulfillment_records_nfe_number_idx
  on public.fulfillment_records (nfe_number);
create index if not exists fulfillment_records_nfe_key_idx
  on public.fulfillment_records (nfe_key);
create index if not exists fulfillment_records_tracking_code_idx
  on public.fulfillment_records (tracking_code);
create index if not exists fulfillment_records_sale_date_idx
  on public.fulfillment_records (sale_date desc);
create index if not exists fulfillment_records_seller_id_idx
  on public.fulfillment_records (seller_id);
create index if not exists fulfillment_records_delivery_status_idx
  on public.fulfillment_records (delivery_status);

-- updated_at automático — reaproveita public.set_updated_at() (já existe).
drop trigger if exists fulfillment_records_set_updated_at on public.fulfillment_records;
create trigger fulfillment_records_set_updated_at
  before update on public.fulfillment_records
  for each row execute function public.set_updated_at();

alter table public.fulfillment_records enable row level security;
revoke all on table public.fulfillment_records from anon;

drop policy if exists "fulfillment_records_admin_all" on public.fulfillment_records;
create policy "fulfillment_records_admin_all" on public.fulfillment_records
  for all
  using (is_admin())
  with check (is_admin());

-- ----------------------------------------------------------------------------
-- Trilha de auditoria (append-only)
-- ----------------------------------------------------------------------------

create table if not exists public.fulfillment_audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- Sem FK de propósito: o log deve sobreviver mesmo se o registro um dia sair.
  record_id uuid not null,
  action text not null check (action in ('CREATED', 'DOCUMENT_VIEWED')),
  actor_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fulfillment_audit_logs_record_idx
  on public.fulfillment_audit_logs (record_id, created_at desc);

alter table public.fulfillment_audit_logs enable row level security;
revoke all on table public.fulfillment_audit_logs from anon;

drop policy if exists "fulfillment_audit_logs_admin_select" on public.fulfillment_audit_logs;
create policy "fulfillment_audit_logs_admin_select" on public.fulfillment_audit_logs
  for select
  using (is_admin());

drop policy if exists "fulfillment_audit_logs_admin_insert" on public.fulfillment_audit_logs;
create policy "fulfillment_audit_logs_admin_insert" on public.fulfillment_audit_logs
  for insert
  with check (is_admin() and actor_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Storage: bucket PRIVADO (public = false) só para PDF, 2MB por arquivo.
-- Nenhuma policy de leitura pública. Sem policy de update (arquivos não são
-- sobrescritos); delete existe só para o app limpar um upload parcial quando
-- o registro falha ao ser gravado.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fulfillment-documents',
  'fulfillment-documents',
  false,
  2097152,
  array['application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "fulfillment_documents_admin_select" on storage.objects;
create policy "fulfillment_documents_admin_select" on storage.objects
  for select
  using (bucket_id = 'fulfillment-documents' and is_admin());

drop policy if exists "fulfillment_documents_admin_insert" on storage.objects;
create policy "fulfillment_documents_admin_insert" on storage.objects
  for insert
  with check (bucket_id = 'fulfillment-documents' and is_admin());

drop policy if exists "fulfillment_documents_admin_delete" on storage.objects;
create policy "fulfillment_documents_admin_delete" on storage.objects
  for delete
  using (bucket_id = 'fulfillment-documents' and is_admin());
