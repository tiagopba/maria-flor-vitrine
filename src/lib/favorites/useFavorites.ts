"use client";

import { useEffect, useState } from "react";
import { FAVORITES_CHANGED_EVENT, getFavoriteCount, getFavorites, isFavorited, type FavoriteEntry } from "./storage";

/**
 * Estado inicial sempre "não favoritado" / "0" — é o que o servidor também
 * renderiza (localStorage não existe lá), então não há hydration mismatch.
 * O valor real é lido só depois de montar, num useEffect.
 */

export function useIsFavorited(productId: string): boolean {
  const [fav, setFav] = useState(false);

  useEffect(() => {
    const sync = () => setFav(isFavorited(productId));
    sync();
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
  }, [productId]);

  return fav;
}

export function useFavoritesCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(getFavoriteCount());
    sync();
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
  }, []);

  return count;
}

/** Para a própria página /favoritos — precisa da lista completa (com
 * tamanho escolhido), não só de um id ou da contagem. */
export function useFavoritesList(): FavoriteEntry[] {
  const [entries, setEntries] = useState<FavoriteEntry[]>([]);

  useEffect(() => {
    const sync = () => setEntries(getFavorites());
    sync();
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
  }, []);

  return entries;
}
