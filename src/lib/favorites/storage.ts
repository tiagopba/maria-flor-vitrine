"use client";

/**
 * Única fonte de verdade para favoritos no navegador — localStorage
 * versionado, guardando só o mínimo (id, tamanho escolhido, quando).
 * Nome, preço, foto e descrição NUNCA são salvos aqui — sempre vêm do banco
 * quando /favoritos carrega, para que mudanças de preço/status reflitam
 * corretamente. Isso também deixa a estrutura pronta para, no futuro,
 * trocar o back-end de "localStorage" para "conta da cliente" sem mudar a
 * UI: só essa camada precisaria mudar.
 */

const STORAGE_KEY = "mariaflor:favorites:v1";

/** Disparado em toda mudança (adicionar/remover/trocar tamanho/limpar) —
 * é assim que outros componentes (coração no card, contador no header,
 * página de favoritos) ficam sincronizados sem precisar de um Context
 * global nem de bibliotecas de estado. */
export const FAVORITES_CHANGED_EVENT = "mf:favorites-changed";

export interface FavoriteEntry {
  product_id: string;
  selected_size?: string;
  added_at: string;
}

function readRaw(): FavoriteEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is FavoriteEntry => e && typeof e.product_id === "string" && typeof e.added_at === "string"
    );
  } catch {
    return [];
  }
}

function writeRaw(entries: FavoriteEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
}

export function getFavorites(): FavoriteEntry[] {
  return readRaw();
}

export function getFavoriteCount(): number {
  return readRaw().length;
}

export function isFavorited(productId: string): boolean {
  return readRaw().some((e) => e.product_id === productId);
}

export function addFavorite(productId: string): void {
  const entries = readRaw();
  if (entries.some((e) => e.product_id === productId)) return;
  entries.unshift({ product_id: productId, added_at: new Date().toISOString() });
  writeRaw(entries);
}

export function removeFavorite(productId: string): void {
  const entries = readRaw();
  const next = entries.filter((e) => e.product_id !== productId);
  if (next.length === entries.length) return;
  writeRaw(next);
}

/** Retorna o novo estado (true = acabou de favoritar). */
export function toggleFavorite(productId: string): boolean {
  if (isFavorited(productId)) {
    removeFavorite(productId);
    return false;
  }
  addFavorite(productId);
  return true;
}

export function getSelectedSize(productId: string): string | undefined {
  return readRaw().find((e) => e.product_id === productId)?.selected_size;
}

export function setSelectedSize(productId: string, size: string | null): void {
  const entries = readRaw();
  const idx = entries.findIndex((e) => e.product_id === productId);
  if (idx === -1) return;
  entries[idx] = { ...entries[idx], selected_size: size ?? undefined };
  writeRaw(entries);
}

/** Remove entradas cujo produto não veio mais na busca pública (arquivado,
 * despublicado ou excluído) — chamado pela página /favoritos depois de
 * confirmar contra o banco, nunca antes. */
export function removeFavoritesNotIn(validProductIds: Set<string>): void {
  const entries = readRaw();
  const next = entries.filter((e) => validProductIds.has(e.product_id));
  if (next.length === entries.length) return;
  writeRaw(next);
}

export function clearFavorites(): void {
  writeRaw([]);
}
