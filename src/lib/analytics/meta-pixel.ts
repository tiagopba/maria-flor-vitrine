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

function devLog(eventName: string, params?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[META] ${eventName}`, params ?? {});
}

/**
 * Dispara um evento padrão do Meta Pixel (`fbq('track', ...)`). Sempre
 * fire-and-forget e silencioso: se o script do Pixel não carregou (Pixel ID
 * não configurado, bloqueador de anúncios, etc.), `window.fbq` não existe e
 * a chamada simplesmente não faz nada — nunca deve impedir a ação real da
 * cliente nem gerar erro no console.
 */
export function trackPixelEvent(eventName: string, params?: Record<string, unknown>): void {
  try {
    devLog(eventName, params);
    window.fbq?.("track", eventName, params);
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
 */
export function trackViewContent(product: MetaTrackableProduct): void {
  trackPixelEvent("ViewContent", {
    content_ids: [product.code],
    content_name: product.name,
    content_type: "product",
    value: product.price,
    currency: "BRL",
  });
}

/**
 * AddToCart — "Minha Seleção" faz o papel de carrinho aqui. Só deve ser
 * chamado depois que a peça REALMENTE entrou na seleção (após escolher
 * tamanho, quando existir mais de um) — nunca só no clique de
 * "Quero essa peça". `selectedSize` é opcional: entra em `selected_size`
 * só quando já se sabe o tamanho no momento da adição.
 */
export function trackAddToCart(product: MetaTrackableProduct, selectedSize?: string | null): void {
  trackPixelEvent("AddToCart", {
    content_ids: [product.code],
    content_name: product.name,
    content_type: "product",
    value: product.price,
    currency: "BRL",
    ...(selectedSize ? { selected_size: selectedSize } : {}),
  });
}

/**
 * Lead — o evento mais importante do funil: disparado só no último passo,
 * junto da abertura real do WhatsApp (nunca ao abrir a tela de escolha de
 * vendedora). Nunca inclui PII (nome/telefone/e-mail/endereço da cliente
 * ou da vendedora) — só dados agregados da seleção.
 */
export function trackLead(lead: MetaLeadData): void {
  trackPixelEvent("Lead", {
    content_ids: lead.contentIds,
    content_type: "product",
    value: lead.value,
    currency: "BRL",
    num_items: lead.numItems,
  });
}
