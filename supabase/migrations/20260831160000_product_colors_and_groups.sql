-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário
--
-- Modelo de cores de produto + agrupamento "mesmo modelo em cores
-- diferentes" + redirects de slug histórico. Tudo aditivo: nenhuma coluna
-- ou tabela existente é removida/renomeada, nenhum produto existente é
-- alterado por esta migration (color_id e product_group_id nascem NULL em
-- todo produto já cadastrado).

-- 1) colors ------------------------------------------------------------------
-- Mesmo padrão de categories: nome é a informação principal (cobre casos
-- como "Poá", "Onça", "Estampado" que não têm um hex real), hex_color é
-- só um apoio visual opcional pro chip no admin.
create table if not exists colors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  hex_color text null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists colors_active_idx on colors (active);

alter table colors enable row level security;

drop policy if exists "colors_public_read" on colors;
create policy "colors_public_read" on colors
  for select using (active = true);

drop policy if exists "colors_admin_read_all" on colors;
create policy "colors_admin_read_all" on colors
  for select using (is_catalog_editor_or_admin());

drop policy if exists "colors_admin_write" on colors;
create policy "colors_admin_write" on colors
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- 2) product_groups -----------------------------------------------------------
-- Só o agrupamento em si ("essas peças são o mesmo modelo") — nunca lido
-- diretamente pelo público: a página do produto busca os "irmãos" direto
-- em products.product_group_id (já público via products_public_read), então
-- esta tabela não precisa de policy pública nenhuma, só admin.
create table if not exists product_groups (
  id uuid primary key default gen_random_uuid(),
  name text null,
  created_at timestamptz not null default now()
);

alter table product_groups enable row level security;

drop policy if exists "product_groups_admin_all" on product_groups;
create policy "product_groups_admin_all" on product_groups
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- 3) products: novas colunas ---------------------------------------------------
alter table products
  add column if not exists color_id uuid null references colors(id) on delete set null,
  add column if not exists product_group_id uuid null references product_groups(id) on delete set null;

create index if not exists products_color_idx on products (color_id);
create index if not exists products_group_idx on products (product_group_id);

comment on column products.color_id is
  'Cor principal da peça (opcional). NULL = produto sem cor definida, comportamento idêntico ao atual.';
comment on column products.product_group_id is
  'Agrupamento "mesmo modelo, cores diferentes" (opcional). NULL = produto avulso, não relacionado a nenhum outro. Nunca preenchido automaticamente em produto existente — só quando a admin relaciona explicitamente.';

-- 4) product_slug_redirects -----------------------------------------------------
-- Guarda cada slug antigo de um produto que já foi publicado e depois teve
-- o slug alterado. old_slug é UNIQUE por design — a constraint em si não
-- resolve o que fazer num conflito; isso é responsabilidade da camada de
-- aplicação (lib/db/products.ts), que NUNCA transfere old_slug de um
-- product_id para outro silenciosamente:
--   * mesmo product_id (voltando a um slug que já foi dele antes) →
--     operação idempotente, sem duplicar linha;
--   * product_id diferente (colisão histórica genuína, rara) → a criação
--     desse redirect específico é apenas ignorada — o produto salva
--     normalmente, só não ganha aquele atalho de URL antiga específico;
--     nunca bloqueia o cadastro/edição do produto por causa disso.
create table if not exists product_slug_redirects (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  old_slug text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists product_slug_redirects_product_idx on product_slug_redirects (product_id);

alter table product_slug_redirects enable row level security;

-- Leitura pública só resolve o redirect se o produto de destino ainda
-- estiver visível (mesma regra de products_public_read) — evita redirect
-- pra um produto arquivado/despublicado.
drop policy if exists "product_slug_redirects_public_read" on product_slug_redirects;
create policy "product_slug_redirects_public_read" on product_slug_redirects
  for select using (
    exists (
      select 1 from products p
      where p.id = product_slug_redirects.product_id
        and p.status <> 'ARCHIVED'
        and p.published_at is not null
    )
  );

drop policy if exists "product_slug_redirects_admin_all" on product_slug_redirects;
create policy "product_slug_redirects_admin_all" on product_slug_redirects
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());
