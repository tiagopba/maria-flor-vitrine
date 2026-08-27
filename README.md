# Maria Flor Vitrine

"O Story da Maria Flor que não desaparece."

Catálogo digital permanente e mensurável para a Maria Flor (moda feminina):
mostra as novidades vistas no Instagram, gera desejo, organiza por
categoria/coleção/provador, rastreia o interesse e leva a cliente para o
WhatsApp, onde a vendedora confirma a disponibilidade e fecha a venda.

Domínio alvo: `www.modamariaflor.com.br`.

Não é um e-commerce tradicional: sem checkout, pagamento online ou reserva
automática de estoque. Ver [`docs/business-rules.md`](docs/business-rules.md)
para as regras de negócio que orientam todas as decisões de produto.

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Supabase
(Postgres + Auth + Storage).

## Documentação

- [`docs/architecture.md`](docs/architecture.md) — arquitetura, camadas, fluxos
- [`docs/database.md`](docs/database.md) — schema, relacionamentos, RLS
- [`docs/analytics.md`](docs/analytics.md) — eventos, GA4, Meta Pixel/CAPI, Índice de Desejo
- [`docs/business-rules.md`](docs/business-rules.md) — regras de negócio

## Setup local

1. Instalar dependências:

   ```bash
   npm install
   ```

2. Criar um projeto em [supabase.com](https://supabase.com), copiar
   `.env.example` para `.env.local` e preencher `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`
   (Settings → API no dashboard).

3. Aplicar o schema (com o [Supabase CLI](https://supabase.com/docs/guides/cli)):

   ```bash
   npx supabase link --project-ref <seu-project-ref>
   npx supabase db push
   npx supabase gen types typescript --linked > src/types/database.ts
   ```

4. Criar a primeira usuária administrativa: cadastre um usuário no
   Supabase Auth (dashboard → Authentication) e insira a linha
   correspondente em `profiles` com `role = 'admin'`.

5. Rodar o dev server:

   ```bash
   npm run dev
   ```

   Vitrine pública em `http://localhost:3000`, painel em
   `http://localhost:3000/admin`.

## Estrutura

Ver [`docs/architecture.md`](docs/architecture.md#camadas) para a árvore de
pastas completa e a regra de dependência entre client/server/service role.
