"use client";

/**
 * Classificação simples de dispositivo a partir do user agent — só pra
 * segmentar o dashboard (item "origem do tráfego"/dispositivo), não pra
 * nenhuma decisão de layout (isso já é feito por CSS responsivo normal).
 */
export function getDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";

  const ua = navigator.userAgent;
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}
