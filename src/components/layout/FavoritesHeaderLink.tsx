"use client";

import Link from "next/link";
import { useFavoritesCount } from "@/lib/favorites/useFavorites";

/**
 * Coração + contador no header público. Renderiza "0"/sem contador no
 * servidor (localStorage não existe lá) e atualiza sozinho depois de
 * montar — sem isso, o número renderizado no servidor nunca bateria com o
 * do navegador da cliente e o React acusaria hydration mismatch.
 */
export function FavoritesHeaderLink() {
  const count = useFavoritesCount();

  return (
    <Link
      href="/favoritos"
      aria-label={count > 0 ? `Minha seleção, ${count} ${count === 1 ? "peça salva" : "peças salvas"}` : "Minha seleção"}
      className="flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-text-muted hover:bg-muted"
    >
      <span className="text-xs font-semibold text-text">Minha Seleção</span>
      <HeartIcon filled={count > 0} />
      {count > 0 && <span className="text-xs font-medium text-text">{count}</span>}
    </Link>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      className={filled ? "text-primary" : undefined}
    >
      <path d="M12 21s-6.7-4.35-9.3-8.1C1 10.1 1.8 6.6 4.9 5.3c2.1-.9 4.2 0 5.6 1.9L12 8.7l1.5-1.5c1.4-1.9 3.5-2.8 5.6-1.9 3.1 1.3 3.9 4.8 2.2 7.6C18.7 16.65 12 21 12 21z" />
    </svg>
  );
}
