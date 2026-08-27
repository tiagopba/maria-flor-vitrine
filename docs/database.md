# Banco de dados — Maria Flor Vitrine

Schema completo em [`supabase/migrations/20260827120000_init_schema.sql`](../supabase/migrations/20260827120000_init_schema.sql)
+ bucket de imagens em [`20260827120100_storage_products_bucket.sql`](../supabase/migrations/20260827120100_storage_products_bucket.sql).

## Como aplicar

Com o [Supabase CLI](https://supabase.com/docs/guides/cli) instalado e o
projeto criado no dashboard:

```bash
npx supabase link --project-ref <seu-project-ref>
npx supabase db push
npx supabase gen types typescript --linked > src/types/database.ts
```

## Entidades

| Tabela | Descrição |
|---|---|
| `profiles` | Usuárias do painel, com `role` (`admin`/`catalog_editor`/`seller`). 1:1 com `auth.users`. |
| `categories` | Categorias administráveis (Jeans, Vestidos...). |
| `products` | Peça do catálogo. `code` e `slug` únicos. `status` controla visibilidade pública. |
| `product_images` | Fotos do produto, ordenáveis por `position` (0 = capa). |
| `product_sizes` | Tamanhos disponíveis para consulta (texto livre, sem enum fechado). |
| `size_options` | Sugestões de tamanho para autocomplete no admin (não restringe `product_sizes`). |
| `provadores` | "Provador da Eliara" — sessão de looks, com `slug` e `status`. |
| `provador_looks` | Looks dentro de um provador. |
| `provador_look_products` | Produtos que compõem cada look. |
| `collections` | Drops/coleções, com janela de datas opcional. |
| `collection_products` | Produtos de cada coleção. |
| `sellers` | Vendedoras (número de WhatsApp, prioridade de distribuição). |
| `leads` | Contato capturado (nome, WhatsApp, consentimentos). |
| `lead_interests` | Produto/categoria de interesse associado a um lead. |
| `analytics_events` | Trilho interno de eventos (ver `docs/analytics.md`). |
| `site_settings` | Config chave/valor (`WHATSAPP_MODE`, `DESIRE_SCORE_WEIGHTS`). |
| `consent_records` | Registro de consentimento LGPD por sessão/lead. |

## Relacionamentos-chave

- `products.category_id → categories.id` (`RESTRICT`: não é possível apagar
  categoria com produtos).
- `product_images`/`product_sizes` → `products` (`CASCADE`: somem se o
  produto for apagado — na prática produtos são arquivados, não apagados).
- `provador_look_products.product_id` e `collection_products.product_id` →
  `products` (`RESTRICT`): um produto usado em look/coleção não pode ser
  apagado, só arquivado.
- `analytics_events` referencia produto/categoria/provador/coleção/vendedora
  como `SET NULL`: o evento histórico sobrevive mesmo se a entidade for
  removida.

## Índices relevantes

- `products (status, published_at)` — listagem pública.
- `products (category_id)` — filtro por categoria.
- `products (code)` + `products (name) gin_trgm` — busca por código/nome.
- `analytics_events (event_type, created_at)` e `(product_id)`/`(session_id)`
  — consultas do dashboard.

## RLS — resumo

Leitura pública liberada em: `categories` (active), `products`
(status ≠ ARCHIVED e publicado), `product_images`/`product_sizes` (via
produto público), `provadores`/`provador_looks`/`provador_look_products`
(provador PUBLISHED), `collections`/`collection_products` (ativa e dentro da
janela de datas).

Todo o resto exige `is_catalog_editor_or_admin()` ou `is_admin()`
(funções SQL que checam `profiles.role` para `auth.uid()`).

`leads`, `lead_interests`, `analytics_events`, `consent_records`: sem
policy de insert para `anon`/`authenticated` — só a service role (usada nas
rotas de API) grava; leitura liberada para admin/catalog_editor (dashboard).

Detalhes completos de negócio por trás dessas escolhas: ver
[`docs/business-rules.md`](./business-rules.md).
