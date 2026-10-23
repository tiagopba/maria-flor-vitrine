"use client";

/**
 * Guarda SÓ o nome da cidade resolvida pela última consulta de CEP com
 * sucesso no bloco de frete de /favoritos (ver SmartShippingBlock /
 * viacep.ts) — mesmo espírito de state-storage.ts e postal-code-storage.ts
 * (versionado, client-only, nunca banco). Único uso: mostrar "Cidade - UF ✓"
 * sem reconsultar a cada remontagem, e repassar "Cidade/UF" pronta na
 * mensagem de WhatsApp.
 */
const STORAGE_KEY = "mariaflor:shipping-city:v1";

export function getSavedShippingCity(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveShippingCity(city: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, city);
  } catch {
    // localStorage indisponível (modo privado, quota) — a cidade só não
    // persiste pra próxima visita; a tela continua funcionando normalmente.
  }
}

export function clearShippingCity(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // mesmo motivo do catch acima.
  }
}
