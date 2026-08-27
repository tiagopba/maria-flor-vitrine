# Analytics — Maria Flor Vitrine

## Eventos internos (`analytics_events`)

| Evento | Quando dispara |
|---|---|
| `PRODUCT_VIEW` | Abertura da página de um produto |
| `CATEGORY_VIEW` | Abertura de `/categoria/[slug]` |
| `SEARCH` | Busca executada (`/busca`) |
| `SIZE_SELECTED` | Cliente seleciona um tamanho na página do produto |
| `FAVORITE_ADDED` / `FAVORITE_REMOVED` | Toque no coração |
| `WHATSAPP_CLICK` | **Conversão principal** — clique em "Quero essa peça" |
| `PROVADOR_VIEW` | Abertura de um provador |
| `LOOK_WHATSAPP_CLICK` | Clique em "Quero o look" |
| `COLLECTION_VIEW` | Abertura de uma coleção/drop |
| `LEAD_SUBMITTED` | Formulário de captura de lead enviado |
| `SHARE_PRODUCT` | Compartilhamento de produto |

Todo evento carrega, quando disponível: `session_id` (anônimo,
`lib/session/visitor-id.ts`), UTM persistido na sessão
(`lib/utm/persist.ts`), e o id da entidade relevante (produto, categoria,
provador, coleção, vendedora, tamanho).

Gravação:
- Eventos de navegação (`PRODUCT_VIEW`, `SEARCH`, ...): `POST /api/analytics/track`.
- `WHATSAPP_CLICK`/`LOOK_WHATSAPP_CLICK`: gravados dentro de
  `POST /api/whatsapp/click`, já com o `seller_id` resolvido — evita
  depender de dois requests separados para a conversão principal.

Nunca gravamos IP como identificador de cliente, nem dados pessoais fora do
fluxo de lead (que exige consentimento explícito).

## Índice de Desejo

Ver [`business-rules.md`](./business-rules.md#fórmula-do-índice-de-desejo).
Calculado a partir de contagens de `PRODUCT_VIEW`, `FAVORITE_ADDED`,
`SIZE_SELECTED` e `WHATSAPP_CLICK` por produto.

## GA4

Módulo: `lib/analytics/ga4.ts`. Carregado apenas após consentimento de
analytics. Mapeamento:

| Ação | Evento GA4 |
|---|---|
| Ver produto | `view_item` |
| Ver listagem | `view_item_list` |
| Buscar | `search` |
| Selecionar produto num grid | `select_item` |
| Enviar lead | `generate_lead` |
| Clique WhatsApp | evento customizado `whatsapp_click` |
| Selecionar tamanho | evento customizado `size_selected` |
| Ver provador | evento customizado `provador_view` |

## Meta Pixel + Conversions API

Módulos: `lib/analytics/meta/pixel.ts` (client) e `lib/analytics/meta/capi.ts`
(server). Carregados só após consentimento de marketing.

| Ação | Evento Meta |
|---|---|
| Ver produto | `ViewContent` |
| Buscar | `Search` |
| Favoritar | `AddToWishlist` |
| Enviar lead | `Lead` |
| Clique WhatsApp | `Contact` (ou evento customizado equivalente) |

Dedupe Pixel/CAPI via `event_id` compartilhado (gerado uma vez por evento e
enviado nos dois lados). CAPI nunca expõe token no client — token fica só
em `META_CONVERSIONS_API_TOKEN` (variável server-only).

## Consentimento

Categorias: `Necessários` (sempre ativo), `Analytics`, `Marketing`.
Scripts de GA4/Meta só carregam conforme o consentimento salvo em
`consent_records`. Nunca pré-marcar Marketing. Ver `/politica-de-privacidade`.
