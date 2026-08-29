-- ============================================================================
-- PREPARADA, NÃO APLICADA — aguardando aprovação explícita do usuário.
--
-- Tabela nova pra "Seleção Compartilhável" (/selecao/[token]). Aditiva:
-- nenhuma tabela existente é alterada, nenhum produto/favorito é tocado,
-- nada é apagado.
--
-- Decisão de modelagem: JSONB num único campo (`items`) em vez de duas
-- tabelas (shared_selections + shared_selection_items). Motivo: o acesso
-- é sempre "ler a seleção inteira por token" — nunca precisamos consultar
-- "quais seleções contêm o produto X" nem qualquer outra consulta
-- relacional pelos itens. Uma linha por seleção é mais simples, atômica
-- (sem risco de item órfão) e mais barata (1 insert, 1 select). Os itens
-- guardam só `product_id` e `selected_size` — nome, preço, foto e status
-- NUNCA são duplicados aqui; a página /selecao/[token] busca tudo isso ao
-- vivo em products/product_images (reaproveitando getProductsByIdsPublic,
-- já existente), então preço/disponibilidade sempre refletem o estado
-- atual do produto, nunca um snapshot antigo.
--
-- token é a chave primária (texto, gerado em código via bytes
-- criptograficamente aleatórios — ver src/lib/selections/token.ts) em vez
-- de um id interno separado: não há necessidade de um identificador
-- interno distinto do identificador público aqui.
--
-- Sem policy de RLS pública nenhuma (leitura e escrita só via
-- service_role, dentro de Server Actions/Server Components) — mesmo
-- padrão já usado em `sellers` e `analytics_events` neste projeto. Isso
-- evita que a tabela seja enumerável via REST anônimo; a imprevisibilidade
-- do token continua sendo a proteção de acesso à seleção em si.
-- ============================================================================

create table shared_selections (
  token text primary key,
  items jsonb not null,
  session_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index shared_selections_expires_at_idx on shared_selections (expires_at);

alter table shared_selections enable row level security;
