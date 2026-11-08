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

### `user_data` enviado por evento

| Evento | `fbp`/`fbc` | `em`/`fn`/`ln` | `external_id` |
|---|---|---|---|
| `ViewContent`, `AddToCart` | sim (espera curta pelo Pixel real — ver `waitForFacebookBrowserIds`) | nunca | sim (hash do `session_id`) |
| `Lead`/`Contact` do WhatsApp (favoritos/produto) | sim (sem espera — nunca atrasa a abertura do WhatsApp) | nunca (fluxo anônimo por desenho) | sim |
| `Lead`/`CompleteRegistration` do Grupo de Ofertas | sim | sim, só quando coletado com consentimento explícito no formulário | sim |

**Visitante anônimo** (sem Grupo de Ofertas): CAPI sempre leva IP+UA, `fbp`
quando o Pixel já carregou a tempo, `fbc` só com clique de anúncio
(`fbclid`), e `external_id` (hash do `session_id`) — nunca `em`/`ph`/nome,
nunca CEP/localização presumidos. `external_id` melhora a correspondência,
mas nunca é garantia de resolver sozinho o diagnóstico de "parâmetros
ausentes" da Meta — sem e-mail/telefone reais, a correspondência de um
visitante anônimo tem um teto natural.

### Corrida Pixel × CAPI (`_fbp`/`_fbc`)

`_fbp` só existe no navegador depois que o `fbevents.js` real termina de
carregar — carregar `<Script>` do base code não é suficiente. Pra
`ViewContent`/`AddToCart` (chamadas fire-and-forget, nunca travam a UI),
`waitForFacebookBrowserIds()` (`lib/analytics/meta-pixel.ts`) espera esse
carregamento até um timeout curto (600ms) antes de disparar a CAPI — nunca
bloqueia indefinidamente, nunca gera cookie. Fluxos que a cliente espera na
tela (Lead do WhatsApp, Lead/CompleteRegistration do Grupo de Ofertas)
nunca usam essa espera, pra não atrasar a ação real.

## Consentimento

Categorias: `Necessários` (sempre ativo), `Analytics`, `Marketing`.
Scripts de GA4/Meta só carregam conforme o consentimento salvo em
`consent_records`. Nunca pré-marcar Marketing. Ver `/politica-de-privacidade`.

> **Pendência de privacidade (2026-11-08):** o banner de consentimento por
> categoria descrito acima (`consent_records`, gate de Analytics/Marketing)
> **não existe na implementação atual** — `<MetaPixel />`
> ([layout.tsx](../src/app/(public)/layout.tsx)) carrega incondicionalmente,
> sem nenhum gate de consentimento, e não há módulo `lib/analytics/ga4.ts`
> nem componente de banner no código. Fora do escopo da correção de
> `user_data` da CAPI feita em 2026-11 — registrado aqui pra ser tratado
> como item separado.
