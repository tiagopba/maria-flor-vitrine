"use client";

import { isValidPostalCode } from "./postal-code";

/**
 * Guarda SÓ o CEP opcional informado no bloco de frete de /favoritos —
 * mesmo espírito de state-storage.ts (versionado, self-heal em leitura
 * inválida). Único uso: repassar à vendedora no texto da mensagem de
 * WhatsApp (ver buildFavoritesWhatsAppMessage); nunca consulta Correios.
 */
const STORAGE_KEY = "mariaflor:shipping-postal-code:v1";

/** null se nunca informou, ou se o valor salvo não é um CEP completo (limpa sozinho). */
export function getSavedPostalCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    if (!isValidPostalCode(raw)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/** Salva o valor bruto (mesmo incompleto, enquanto a cliente ainda digita) — leitura sempre revalida. */
export function saveShippingPostalCode(value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!value) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage indisponível (modo privado, quota) — o CEP só não
    // persiste pra próxima visita; a tela continua funcionando normalmente.
  }
}
