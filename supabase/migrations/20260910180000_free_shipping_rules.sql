-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
-- ============================================================================
-- free_shipping_rules: condições promocionais de frete grátis por estado,
-- geridas 100% pelo Admin (Configurações → Frete grátis) — nunca hardcoded
-- no código. Cada linha é uma condição "SERVIÇO grátis a partir de R$ X"
-- pra um estado. Estado sem nenhuma linha aqui = sem promoção configurada
-- (comportamento esperado, não é erro — não é obrigatório cadastrar os 27
-- estados).
--
-- Design deliberado (ver auditoria que acompanha esta migration):
--   - Tabela dedicada, não mais uma chave em `site_settings`: aqui existe
--     uma restrição de unicidade real por linha (state_code, service) que
--     um blob JSONB não garante no banco, e o Admin precisa criar/editar/
--     ativar/desativar/remover linhas individualmente — não "salvar um
--     objeto inteiro" como PAYMENT_SETTINGS/INSTITUTIONAL_INFO.
--   - `minimum_amount` é `numeric(10,2)`, nunca float — dinheiro nunca é
--     ponto flutuante binário (mesmo motivo de `products.price` já ser
--     numeric).
--   - Sem policy de leitura pública: mesmo padrão de `site_settings`
--     (PAYMENT_SETTINGS já funciona assim). O público nunca lê esta tabela
--     direto — só através do Route Handler novo em /api/frete-gratis, que
--     roda no servidor com o client admin e devolve só os campos/linhas
--     ativas necessárias pro seletor de estado.
--
-- Referências explícitas de schema (public.) em tudo — mesmo padrão das
-- duas migrations aplicadas mais recentes (product_size_fit_compatibilities
-- e sua RPC), pelo mesmo motivo: nunca depender do search_path da sessão
-- que rodar o script.

create table public.free_shipping_rules (
  id uuid primary key default gen_random_uuid(),
  state_code text not null check (state_code in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  )),
  service text not null check (service in ('PAC', 'SEDEX')),
  minimum_amount numeric(10,2) not null check (minimum_amount > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (state_code, service)
);

-- Índice parcial: a única consulta pública é sempre "linhas ativas",
-- exatamente o filtro que o Route Handler faz.
create index free_shipping_rules_active_idx on public.free_shipping_rules (state_code) where active;

alter table public.free_shipping_rules enable row level security;

-- Mesmo padrão de site_settings_admin_all: só ADMIN/MASTER (is_admin(),
-- não is_catalog_editor_or_admin()) — condição de frete é config
-- financeira/promocional, mesmo nível de acesso de PAYMENT_SETTINGS,
-- não do catálogo geral. public.is_admin() já contempla 'master' desde
-- 20260902100100_master_role_rls_functions.sql — nenhuma role nova.
create policy "free_shipping_rules_admin_all"
on public.free_shipping_rules
for all
using (public.is_admin())
with check (public.is_admin());

-- updated_at automático — reaproveita public.set_updated_at(), já criada em
-- 20260827120000_init_schema.sql e usada por profiles/categories/products/
-- provadores/etc. Nenhuma function nova/duplicada.
create trigger free_shipping_rules_set_updated_at
  before update on public.free_shipping_rules
  for each row execute function public.set_updated_at();

-- Nenhum seed automático aqui — a regra de negócio combinada (MS: PAC 199,90
-- / SEDEX 249,90; SP/MG/PR/MT/GO/DF: PAC 299,90) fica pra uma migration ou
-- ação manual SEPARADA, só depois de aprovação explícita.
