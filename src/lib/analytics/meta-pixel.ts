"use client";

/**
 * ID do Meta Pixel — só de variável de ambiente (`NEXT_PUBLIC_META_PIXEL_ID`),
 * nunca hardcoded. Sem essa variável configurada (dev local, Preview sem
 * Pixel próprio, ou a loja simplesmente ainda não tem um), o Pixel não
 * carrega e todo `trackPixelEvent` vira no-op — nunca quebra nada.
 */
export function getMetaPixelId(): string | null {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  return id && id.trim() ? id.trim() : null;
}

function devLog(eventName: string, params?: Record<string, unknown>, eventId?: string): void {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[META] ${eventName}`, params ?? {}, eventId ? `eventID=${eventId}` : "");
}

/**
 * Fila mínima em memória (nunca localStorage, nunca sobrevive a reload) —
 * existe só pra cobrir a janela entre o mount de componentes que disparam
 * evento cedo (ex.: ProductViewTracker) e o momento em que a tag <Script>
 * do base code (MetaPixel.tsx, strategy="afterInteractive") efetivamente
 * roda e cria `window.fbq`. Antes dessa correção, `window.fbq?.(...)`
 * virava no-op silencioso nessa janela e o evento Browser era perdido pra
 * sempre — mesmo com o Pixel carregando normalmente um instante depois.
 * `markMetaPixelReady()` (chamado via onReady do <Script>) esvazia a fila
 * uma única vez; cada item só é reenviado aqui, nunca por retry/polling.
 */
interface QueuedPixelEvent {
  eventName: string;
  params?: Record<string, unknown>;
  eventId?: string;
}

let pixelReady = false;
const pendingEvents: QueuedPixelEvent[] = [];

function sendToFbq(eventName: string, params?: Record<string, unknown>, eventId?: string): void {
  if (eventId) {
    window.fbq?.("track", eventName, params, { eventID: eventId });
  } else {
    window.fbq?.("track", eventName, params);
  }
}

/**
 * Chamado pelo `onReady` do `<Script id="meta-pixel-base">` (ver
 * MetaPixel.tsx) assim que o base code rodou e `window.fbq` passou a
 * existir de verdade. Idempotente — chamar de novo (ex.: onReady disparando
 * mais de uma vez) é seguro, só esvazia o que ainda estiver pendente.
 */
export function markMetaPixelReady(): void {
  pixelReady = true;
  while (pendingEvents.length > 0) {
    const next = pendingEvents.shift();
    if (!next) break;
    try {
      sendToFbq(next.eventName, next.params, next.eventId);
    } catch {
      // Mesma regra de trackPixelEvent abaixo — nunca deixa o Pixel quebrar o fluxo real.
    }
  }
}

/**
 * Dispara um evento padrão do Meta Pixel (`fbq('track', ...)`). Sempre
 * fire-and-forget e silencioso: se o Pixel não está configurado (Pixel ID
 * ausente) ou está bloqueado (adblock), `window.fbq` nunca chega a existir
 * e o evento fica parado na fila pra sempre — nunca gera erro nem afeta a
 * ação real da cliente. Se o Pixel só ainda não carregou (`window.fbq`
 * indefinido no momento da chamada, mas o `<Script>` ainda vai rodar), o
 * evento entra na fila acima e é reenviado por `markMetaPixelReady()` assim
 * que o Pixel ficar pronto — nunca perdido por timing.
 *
 * `eventId`, quando informado, é passado como `eventID` (4º argumento do
 * `fbq`) — é o mecanismo oficial de deduplicação Pixel/CAPI da Meta: o
 * MESMO valor deve ser enviado também no `event_id` do lado servidor (ver
 * lib/analytics/meta-capi.ts) para os dois serem reconhecidos como um único
 * evento. A fila preserva esse `eventId` exatamente como recebido — nunca
 * gera um novo.
 */
export function trackPixelEvent(eventName: string, params?: Record<string, unknown>, eventId?: string): void {
  try {
    devLog(eventName, params, eventId);
    if (pixelReady || window.fbq) {
      sendToFbq(eventName, params, eventId);
    } else {
      pendingEvents.push({ eventName, params, eventId });
    }
  } catch {
    // Nunca deixa uma falha do Pixel afetar o fluxo real.
  }
}

/**
 * Dado mínimo de um produto necessário pros eventos padrão do funil
 * (ViewContent/AddToCart) — `code` é o identificador estável usado em
 * `content_ids` em TODOS os eventos (o mesmo já usado no feed do Meta
 * Catalog como `retailer_id`), nunca `id`/`slug`.
 */
export interface MetaTrackableProduct {
  code: string;
  name: string;
  price: number;
}

/** Dado de uma seleção inteira (Minha Seleção) pro evento `Lead`. */
export interface MetaLeadData {
  contentIds: string[];
  value: number;
  numItems: number;
}

/**
 * PageView — reexporta a semântica já usada pelo base code/troca de rota
 * (ver components/analytics/MetaPixel.tsx), só centralizando a chamada.
 */
export function trackPageView(): void {
  trackPixelEvent("PageView");
}

/**
 * ViewContent — "olhou uma peça de verdade". Só deve ser chamado quando a
 * página individual do produto montou com os dados reais carregados (ver
 * ProductViewTracker, que já faz o guard contra disparo duplicado).
 *
 * `eventId`, quando informado, viaja também para a Conversions API (mesmo
 * evento, mesmo id, dois caminhos) — ver lib/analytics/capi-actions.ts.
 */
export function trackViewContent(product: MetaTrackableProduct, eventId?: string): void {
  trackPixelEvent(
    "ViewContent",
    {
      content_ids: [product.code],
      content_name: product.name,
      content_type: "product",
      value: product.price,
      currency: "BRL",
    },
    eventId
  );
}

/**
 * AddToCart — "Minha Seleção" faz o papel de carrinho aqui. Só deve ser
 * chamado depois que a peça REALMENTE entrou/mudou na seleção (após
 * escolher tamanho, quando existir mais de um) — nunca só no clique de
 * "Quero essa peça", e nunca ao favoritar (ver trackAddToWishlist).
 * `selectedSize` é opcional: entra em `selected_size` só quando já se sabe
 * o tamanho no momento da adição.
 *
 * `eventId`, quando informado, viaja também para a Conversions API (mesmo
 * evento, mesmo id, dois caminhos) — ver lib/analytics/capi-actions.ts.
 */
export function trackAddToCart(product: MetaTrackableProduct, selectedSize?: string | null, eventId?: string): void {
  trackPixelEvent(
    "AddToCart",
    {
      content_ids: [product.code],
      content_name: product.name,
      content_type: "product",
      value: product.price,
      currency: "BRL",
      ...(selectedSize ? { selected_size: selectedSize } : {}),
    },
    eventId
  );
}

/**
 * AddToWishlist — "gostou/salvou a peça", disparado só ao favoritar
 * (coração ligado). Nunca ao desfavoritar. Browser-only por enquanto (sem
 * CAPI própria) — ver FavoriteButton.
 */
export function trackAddToWishlist(product: MetaTrackableProduct): void {
  trackPixelEvent("AddToWishlist", {
    content_ids: [product.code],
    content_name: product.name,
    content_type: "product",
    value: product.price,
    currency: "BRL",
  });
}

/**
 * Lead — o evento mais importante do funil: disparado só no último passo,
 * junto da abertura real do WhatsApp (nunca ao abrir a tela de escolha de
 * vendedora). Nunca inclui PII (nome/telefone/e-mail/endereço da cliente
 * ou da vendedora) — só dados agregados da seleção.
 *
 * `eventId`, quando informado, viaja também para a Conversions API (mesmo
 * evento, mesmo id, dois caminhos) — ver submitFavoritesWhatsAppClick.
 */
export function trackLead(lead: MetaLeadData, eventId?: string): void {
  trackPixelEvent(
    "Lead",
    {
      content_ids: lead.contentIds,
      content_type: "product",
      value: lead.value,
      currency: "BRL",
      num_items: lead.numItems,
    },
    eventId
  );
}
