-- ============================================================================
-- Maria Flor Vitrine — schema inicial (MVP Fase 1 + preparação Fase 2/3)
-- ============================================================================

-- ── Extensões ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ── Função utilitária: updated_at automático ────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- PROFILES (usuárias do painel administrativo)
-- ============================================================================
create type user_role as enum ('admin', 'catalog_editor', 'seller');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role user_role not null default 'catalog_editor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Funções de checagem de papel (usadas nas policies de RLS)
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql stable security definer set search_path = public;

create or replace function is_catalog_editor_or_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('admin', 'catalog_editor')
  );
$$ language sql stable security definer set search_path = public;

-- ============================================================================
-- CATEGORIES
-- ============================================================================
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger categories_set_updated_at
  before update on categories
  for each row execute function set_updated_at();

create index categories_active_position_idx on categories (active, position);

-- ============================================================================
-- PRODUCTS
-- ============================================================================
create type product_status as enum (
  'ACTIVE', 'LAST_UNITS', 'CHECK_AVAILABILITY', 'SOLD_OUT', 'ARCHIVED'
);

create table products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  slug text not null unique,
  description text,
  price numeric(10,2) not null check (price >= 0),
  promotional_price numeric(10,2) check (promotional_price is null or promotional_price >= 0),
  category_id uuid not null references categories(id) on delete restrict,
  status product_status not null default 'ACTIVE',
  featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint promotional_price_lower_than_price
    check (promotional_price is null or promotional_price < price)
);

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

create index products_status_published_idx on products (status, published_at);
create index products_category_idx on products (category_id);
create index products_featured_idx on products (featured) where featured = true;
-- busca por código/nome (ILIKE) e futura extensão para full text
create index products_code_idx on products (code);
create index products_name_trgm_idx on products using gin (name gin_trgm_ops);

-- ============================================================================
-- PRODUCT IMAGES
-- ============================================================================
create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  storage_path text not null,
  alt_text text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_idx on product_images (product_id, position);

-- ============================================================================
-- PRODUCT SIZES
-- ============================================================================
create table product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  size text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, size)
);

create index product_sizes_product_idx on product_sizes (product_id, position);

-- Sugestões de tamanho para acelerar o cadastro no admin (autocomplete), não é enum fechado
create table size_options (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  position int not null default 0
);

-- ============================================================================
-- PROVADORES
-- ============================================================================
create table provadores (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  date date not null default current_date,
  cover_image text,
  description text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger provadores_set_updated_at
  before update on provadores
  for each row execute function set_updated_at();

create index provadores_status_date_idx on provadores (status, date desc);

create table provador_looks (
  id uuid primary key default gen_random_uuid(),
  provador_id uuid not null references provadores(id) on delete cascade,
  title text not null,
  cover_image text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index provador_looks_provador_idx on provador_looks (provador_id, position);

create table provador_look_products (
  id uuid primary key default gen_random_uuid(),
  look_id uuid not null references provador_looks(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  position int not null default 0,
  unique (look_id, product_id)
);

create index provador_look_products_look_idx on provador_look_products (look_id, position);

-- ============================================================================
-- COLLECTIONS (drops)
-- ============================================================================
create table collections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  image text,
  description text,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger collections_set_updated_at
  before update on collections
  for each row execute function set_updated_at();

create index collections_active_idx on collections (active);

create table collection_products (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  position int not null default 0,
  unique (collection_id, product_id)
);

create index collection_products_collection_idx on collection_products (collection_id, position);

-- ============================================================================
-- SELLERS
-- ============================================================================
create table sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  whatsapp_number text not null,
  active boolean not null default true,
  avatar_url text,
  order_priority int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sellers_set_updated_at
  before update on sellers
  for each row execute function set_updated_at();

create index sellers_active_priority_idx on sellers (active, order_priority);

-- ============================================================================
-- LEADS
-- ============================================================================
create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp text not null,
  email text,
  marketing_consent boolean not null default false,
  whatsapp_consent boolean not null default false,
  consent_timestamp timestamptz,
  consent_source text,
  session_id text not null,
  created_at timestamptz not null default now()
);

create index leads_session_idx on leads (session_id);
create index leads_created_idx on leads (created_at desc);

create table lead_interests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create index lead_interests_lead_idx on lead_interests (lead_id);
create index lead_interests_product_idx on lead_interests (product_id);

-- ============================================================================
-- ANALYTICS EVENTS
-- ============================================================================
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'PRODUCT_VIEW', 'CATEGORY_VIEW', 'SEARCH', 'SIZE_SELECTED',
    'FAVORITE_ADDED', 'FAVORITE_REMOVED', 'WHATSAPP_CLICK', 'PROVADOR_VIEW',
    'LOOK_WHATSAPP_CLICK', 'COLLECTION_VIEW', 'LEAD_SUBMITTED', 'SHARE_PRODUCT'
  )),
  session_id text not null,
  product_id uuid references products(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  provador_id uuid references provadores(id) on delete set null,
  collection_id uuid references collections(id) on delete set null,
  seller_id uuid references sellers(id) on delete set null,
  size text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index analytics_events_type_created_idx on analytics_events (event_type, created_at desc);
create index analytics_events_product_idx on analytics_events (product_id);
create index analytics_events_session_idx on analytics_events (session_id);

-- ============================================================================
-- SITE SETTINGS (chave/valor — ex: WHATSAPP_MODE, pesos do índice de desejo)
-- ============================================================================
create table site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger site_settings_set_updated_at
  before update on site_settings
  for each row execute function set_updated_at();

insert into site_settings (key, value) values
  ('WHATSAPP_MODE', '"DEFAULT"'::jsonb),
  ('DESIRE_SCORE_WEIGHTS', '{"view": 1, "favorite": 5, "size_selection": 7, "whatsapp_click": 10}'::jsonb);

-- ============================================================================
-- CONSENT RECORDS (LGPD)
-- ============================================================================
create table consent_records (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  lead_id uuid references leads(id) on delete set null,
  necessary boolean not null default true,
  analytics boolean not null default false,
  marketing boolean not null default false,
  created_at timestamptz not null default now()
);

create index consent_records_session_idx on consent_records (session_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- profiles ------------------------------------------------------------------
alter table profiles enable row level security;

create policy "profiles_select_own_or_admin" on profiles
  for select using (id = auth.uid() or is_admin());

create policy "profiles_update_own_or_admin" on profiles
  for update using (id = auth.uid() or is_admin());

create policy "profiles_admin_insert" on profiles
  for insert with check (is_admin());

-- categories ------------------------------------------------------------------
alter table categories enable row level security;

create policy "categories_public_read" on categories
  for select using (active = true);

create policy "categories_admin_read_all" on categories
  for select using (is_catalog_editor_or_admin());

create policy "categories_admin_write" on categories
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- products ------------------------------------------------------------------
alter table products enable row level security;

create policy "products_public_read" on products
  for select using (
    status <> 'ARCHIVED' and published_at is not null and published_at <= now()
  );

create policy "products_admin_read_all" on products
  for select using (is_catalog_editor_or_admin());

create policy "products_admin_write" on products
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- product_images --------------------------------------------------------------
alter table product_images enable row level security;

create policy "product_images_public_read" on product_images
  for select using (
    exists (
      select 1 from products p
      where p.id = product_images.product_id
        and p.status <> 'ARCHIVED' and p.published_at is not null and p.published_at <= now()
    )
  );

create policy "product_images_admin_all" on product_images
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- product_sizes -----------------------------------------------------------------
alter table product_sizes enable row level security;

create policy "product_sizes_public_read" on product_sizes
  for select using (
    exists (
      select 1 from products p
      where p.id = product_sizes.product_id
        and p.status <> 'ARCHIVED' and p.published_at is not null and p.published_at <= now()
    )
  );

create policy "product_sizes_admin_all" on product_sizes
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- size_options ------------------------------------------------------------------
alter table size_options enable row level security;

create policy "size_options_admin_all" on size_options
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- provadores ------------------------------------------------------------------
alter table provadores enable row level security;

create policy "provadores_public_read" on provadores
  for select using (status = 'PUBLISHED');

create policy "provadores_admin_all" on provadores
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- provador_looks ----------------------------------------------------------------
alter table provador_looks enable row level security;

create policy "provador_looks_public_read" on provador_looks
  for select using (
    exists (select 1 from provadores pr where pr.id = provador_looks.provador_id and pr.status = 'PUBLISHED')
  );

create policy "provador_looks_admin_all" on provador_looks
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- provador_look_products ----------------------------------------------------------
alter table provador_look_products enable row level security;

create policy "provador_look_products_public_read" on provador_look_products
  for select using (
    exists (
      select 1 from provador_looks pl
      join provadores pr on pr.id = pl.provador_id
      where pl.id = provador_look_products.look_id and pr.status = 'PUBLISHED'
    )
  );

create policy "provador_look_products_admin_all" on provador_look_products
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- collections ------------------------------------------------------------------
alter table collections enable row level security;

create policy "collections_public_read" on collections
  for select using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

create policy "collections_admin_all" on collections
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- collection_products ------------------------------------------------------------
alter table collection_products enable row level security;

create policy "collection_products_public_read" on collection_products
  for select using (
    exists (
      select 1 from collections c
      where c.id = collection_products.collection_id
        and c.active = true
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at >= now())
    )
  );

create policy "collection_products_admin_all" on collection_products
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- sellers ------------------------------------------------------------------------
-- Sem acesso público direto: a resolução de vendedora/número acontece no servidor.
alter table sellers enable row level security;

create policy "sellers_admin_all" on sellers
  for all using (is_catalog_editor_or_admin()) with check (is_catalog_editor_or_admin());

-- leads / lead_interests / analytics_events / consent_records -------------------
-- Gravação apenas via server (service role, que ignora RLS) através das rotas de API.
-- Leitura liberada só para admin/catalog_editor (dashboard).
alter table leads enable row level security;
create policy "leads_admin_read" on leads for select using (is_catalog_editor_or_admin());

alter table lead_interests enable row level security;
create policy "lead_interests_admin_read" on lead_interests for select using (is_catalog_editor_or_admin());

alter table analytics_events enable row level security;
create policy "analytics_events_admin_read" on analytics_events for select using (is_catalog_editor_or_admin());

alter table consent_records enable row level security;
create policy "consent_records_admin_read" on consent_records for select using (is_catalog_editor_or_admin());

-- site_settings ------------------------------------------------------------------
alter table site_settings enable row level security;

create policy "site_settings_admin_all" on site_settings
  for all using (is_admin()) with check (is_admin());
