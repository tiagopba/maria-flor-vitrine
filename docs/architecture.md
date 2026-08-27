# Arquitetura — Maria Flor Vitrine

## Stack

- **Next.js 16 (App Router) + TypeScript + React 19** — front-end e back-end
  na mesma aplicação (route handlers para as poucas integrações server-side).
- **Tailwind CSS v4** (config CSS-first em `src/app/globals.css`).
- **Supabase** (Postgres + Auth + Storage) como backend gerenciado.
- Deploy alvo: domínio `www.modamariaflor.com.br`.

## Camadas

```
app/(public)   → páginas da vitrine (clientes)
app/admin      → painel administrativo (equipe Maria Flor), protegido por middleware
app/api        → route handlers: analytics, whatsapp/click, leads, meta CAPI
components/ui       → design system genérico (Button, Input, Modal, Toast...)
components/catalog  → ProductCard, ProductGrid, SizeSelector, Price, Badge
components/whatsapp → WhatsAppButton e variantes (produto, look, favoritos)
components/admin    → formulários e tabelas do painel
lib/supabase   → clients (browser/server/admin) — única porta de entrada ao banco
lib/db         → queries por entidade (uma função = uma operação de negócio)
lib/auth       → checagem de sessão/papel administrativo
lib/analytics  → trilho interno + GA4 + Meta Pixel/CAPI, isolados entre si
lib/whatsapp   → geração de mensagem + resolução de número/vendedora
lib/desire-score → fórmula central do Índice de Desejo
lib/session    → visitor id anônimo (localStorage)
lib/utm        → captura e persistência de UTM na sessão
lib/validation → schemas zod por entidade (única validação, usada em forms e routes)
types/database.ts → tipos do banco (gerar via `supabase gen types` quando o projeto existir)
supabase/migrations → schema versionado em SQL puro
```

**Regra de dependência:** `lib/supabase/admin.ts` (service role) só é
importado dentro de `app/api/**/route.ts` ou `app/admin/**` (server
components/actions). Nunca em um Client Component. O pacote `server-only`
garante isso em build time.

## Autenticação e autorização

- Supabase Auth (email/senha) para a equipe. Sessão via cookies
  (`@supabase/ssr`), atualizada a cada request pelo `src/middleware.ts`.
- `middleware.ts` só garante que existe sessão válida em `/admin/**`
  (exceto `/admin/login`) — não checa papel.
- Checagem de papel (`admin` / `catalog_editor`) acontece em
  `lib/auth/permissions.ts` (`requireAdmin(['admin'])` etc.), chamada no
  topo de cada página/route sensível.
- Cliente da vitrine pública nunca autentica — usa apenas um `session_id`
  anônimo gerado no browser (`lib/session/visitor-id.ts`).

## Segurança

- RLS habilitada em todas as tabelas (ver `docs/database.md`).
- Leitura pública liberada só para o que precisa aparecer na vitrine
  (produtos publicados, categorias ativas, provadores publicados, coleções
  ativas dentro da janela de datas).
- Tabelas sensíveis (`leads`, `analytics_events`, `consent_records`,
  `lead_interests`) não têm policy de insert para `anon`/`authenticated`:
  toda escrita passa por route handlers que usam o client admin
  (service role, valida com zod antes de gravar).
- Upload de imagem: bucket público `products` no Storage, mas sem policy de
  insert para o client — upload sempre via route handler autenticado como
  `catalog_editor`/`admin`, usando o client admin.

## Estratégia de imagens

- MVP: Supabase Storage, bucket `products`, leitura pública, upload
  server-side com validação de tipo (`jpeg/png/webp`) e tamanho (5MB).
- Abstração em `lib/images/provider.ts` (a criar junto com o módulo de
  upload) isola quem chama do provedor concreto, para permitir trocar por
  Cloudinary/outro CDN sem alterar as telas.
- `next/image` para otimização, lazy loading e formatos modernos.

## Analytics — três trilhos independentes

1. **Interno** (`analytics_events`): fonte de verdade para o dashboard.
   Gravado via `POST /api/analytics/track` (eventos de navegação) e dentro
   de `POST /api/whatsapp/click` (conversão principal).
2. **GA4**: carregado no client só após consentimento de analytics.
3. **Meta Pixel + Conversions API**: Pixel no client, CAPI no server,
   compartilhando `event_id` para dedupe. Só após consentimento de
   marketing.

Nenhum dos três conhece a lógica dos outros dois — cada um vive no seu
módulo em `lib/analytics/`.

## Fluxo público

```
Home → Novidades/Categoria/Coleção/Provador/Busca → Produto
  → seleciona tamanho (opcional) → "Quero essa peça"
  → POST /api/whatsapp/click (registra evento, resolve vendedora, monta mensagem)
  → abre wa.me com a mensagem pronta
```

## Fluxo administrativo

```
/admin/login (Supabase Auth)
  → middleware valida sessão → requireAdmin() valida papel
  → Dashboard / Produtos / Provadores / Coleções / Categorias / Vendedoras / Configurações
  → cadastro de produto: fluxo curto (fotos → código → nome → preço →
    categoria → tamanhos → status → publicar), otimizado para celular
```

## Ordem de implementação (Fase 1)

1. Autenticação administrativa (`profiles`, login, middleware, `requireAdmin`)
2. Categorias (CRUD)
3. Produtos (CRUD + status)
4. Upload de fotos (Storage)
5. Listagem pública (`/novidades`, `/categoria/[slug]`)
6. Página de produto
7. Botão WhatsApp (mensagem + tracking)
8. Busca

Depois, só com essa base validada: favoritos, provadores, coleções,
analytics completo (GA4/Meta), dashboard.
