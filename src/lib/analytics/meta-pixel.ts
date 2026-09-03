"use client";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

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

/**
 * Dispara um evento padrão do Meta Pixel (`fbq('track', ...)`). Sempre
 * fire-and-forget e silencioso: se o script do Pixel não carregou (Pixel ID
 * não configurado, bloqueador de anúncios, etc.), `window.fbq` não existe e
 * a chamada simplesmente não faz nada — nunca deve impedir a ação real da
 * cliente nem gerar erro no console.
 */
export function trackPixelEvent(eventName: string, params?: Record<string, unknown>): void {
  try {
    window.fbq?.("track", eventName, params);
  } catch {
    // Nunca deixa uma falha do Pixel afetar o fluxo real.
  }
}

/**
 * Dispara um evento *custom* do Meta Pixel (`fbq('trackCustom', ...)`) —
 * diferente de `trackPixelEvent`, que é só pros eventos padrão do catálogo
 * do Meta (ViewContent, Lead, Contact, etc.). Eventos com nome que o Meta
 * não reconhece como padrão (ex.: "ViewCategory") precisam ir por
 * `trackCustom`, senão o Events Manager não os classifica corretamente.
 * Mesmo comportamento fire-and-forget/silencioso do `trackPixelEvent`.
 */
export function trackPixelCustomEvent(eventName: string, params?: Record<string, unknown>): void {
  try {
    window.fbq?.("trackCustom", eventName, params);
  } catch {
    // Nunca deixa uma falha do Pixel afetar o fluxo real.
  }
}
