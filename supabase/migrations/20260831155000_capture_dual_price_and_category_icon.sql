-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
--
-- Migration de CAPTURA: registra no histórico do repositório colunas e
-- dados que já existem no banco real, aplicados manualmente via SQL
-- Editor em sessões anteriores (modelo de dois preços Pix/cartão e ícone
-- de categoria) sem nunca terem virado arquivo de migration versionado.
-- Todo `if not exists` / guardado por constraint — rodar isso num banco
-- que já tem essas colunas não faz absolutamente nada (no-op seguro);
-- rodar num banco que nunca teve (ex: um ambiente novo do zero) deixa o
-- schema no mesmo estado final que o banco de produção já está hoje.
-- Não altera nenhum dado de produto/categoria existente.

-- 1) products.cash_price / max_installments_override ---------------------------
alter table products
  add column if not exists cash_price numeric(10,2) null
    check (cash_price is null or cash_price >= 0),
  add column if not exists max_installments_override integer null
    check (max_installments_override is null or max_installments_override > 0);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cash_price_lte_price') then
    alter table products
      add constraint cash_price_lte_price
      check (cash_price is null or cash_price <= price);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cash_price_excludes_promotional_price') then
    alter table products
      add constraint cash_price_excludes_promotional_price
      check (cash_price is null or promotional_price is null);
  end if;
end $$;

comment on column products.cash_price is
  'Preço à vista no Pix, cadastrado explicitamente. NULL = produto no modelo legado. Mutuamente exclusivo com promotional_price (constraint cash_price_excludes_promotional_price) até a regra de promoção + Pix ser definida.';
comment on column products.price is
  'Preço a prazo/cartão quando cash_price estiver preenchido; preço único do produto quando cash_price for NULL (comportamento legado, inalterado).';
comment on column products.max_installments_override is
  'Substitui o máximo de parcelas sem juros da loja (PAYMENT_SETTINGS) só para este produto. NULL = usa a configuração global.';

-- 2) categories.icon_key ---------------------------------------------------------
alter table categories
  add column if not exists icon_key text null;

comment on column categories.icon_key is
  'Chave do ícone da categoria — registry central em src/lib/catalog/category-icons.ts. NULL = usa o ícone neutro (Tag) até um admin escolher um específico.';

-- 3) PAYMENT_SETTINGS -------------------------------------------------------------
-- on conflict do nothing: se a chave já existe (é o caso do banco real,
-- hoje com 6x / parcela mínima R$50 configurados pelo admin), esta linha
-- não altera nada. Só serve de seed pra um ambiente que nunca teve a
-- chave — os valores abaixo refletem a regra oficial vigente, não os
-- valores de exemplo usados na primeira versão desta migration.
insert into site_settings (key, value) values (
  'PAYMENT_SETTINGS',
  '{
    "default_max_installments": 6,
    "min_installment_value": 50.00,
    "cash_price_enabled": true,
    "installments_enabled": true
  }'::jsonb
)
on conflict (key) do nothing;
