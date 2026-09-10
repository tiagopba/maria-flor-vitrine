"use client";

import { isValidStateCode } from "./brazilian-states";

/**
 * Guarda SÓ a UF escolhida pra "Para qual estado será o envio?" —
 * versionado, mesmo espírito de lib/favorites/storage.ts. Nunca CEP,
 * endereço, cidade, nome ou telefone: só a sigla de 2 letras.
 */
const STORAGE_KEY = "mariaflor:shipping-state:v1";

/** null se nunca escolheu, ou se o valor salvo não é mais uma UF válida (limpa sozinho). */
export function getSavedShippingState(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    if (!isValidStateCode(code)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

export function saveShippingState(code: string): void {
  if (typeof window === "undefined") return;
  if (!isValidStateCode(code)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // localStorage indisponível (modo privado, quota) — a escolha só não
    // persiste pra próxima visita; a tela continua funcionando normalmente.
  }
}

export function clearShippingState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // mesmo motivo do catch acima.
  }
}
