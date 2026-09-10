"use client";

/**
 * Guarda SÓ a numeração preferida da cliente ("minha numeração") — nunca
 * dado pessoal, nunca exige login, nunca enviado ao banco. Mesmo espírito
 * versionado de lib/favorites/storage.ts e lib/shipping/state-storage.ts.
 * Usado só pra pré-preencher/sugerir o chip nas telas de listagem — nunca
 * aplica filtro sozinho numa página aberta sem `?fit=` explícito.
 */
const STORAGE_KEY = "mariaflor:preferred-fit-size:v1";

function isValidFitSize(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 999;
}

/** null se nunca escolheu, ou se o valor salvo não é mais um inteiro válido (limpa sozinho). */
export function getPreferredFitSize(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    if (!isValidFitSize(value)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function setPreferredFitSize(value: number): void {
  if (typeof window === "undefined") return;
  if (!isValidFitSize(value)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // localStorage indisponível — a preferência só não persiste pra próxima visita.
  }
}

export function clearPreferredFitSize(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // mesmo motivo do catch acima.
  }
}
