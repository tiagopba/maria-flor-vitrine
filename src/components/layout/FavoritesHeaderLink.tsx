"use client";

import Link from "next/link";
import { useFavoritesCount } from "@/lib/favorites/useFavorites";

/**
 * Sacola + contador no header público (era um coração — "Minhas Roupas"
 * virou visualmente "Meu Carrinho", mesmo destino `/favoritos` e mesmo
 * contador de sempre, só a apresentação mudou). Renderiza "0"/sem contador
 * no servidor (localStorage não existe lá) e atualiza sozinho depois de
 * montar — sem isso, o número renderizado no servidor nunca bateria com o
 * do navegador da cliente e o React acusaria hydration mismatch.
 */
export function FavoritesHeaderLink() {
  const count = useFavoritesCount();

  return (
    <Link
      href="/favoritos"
      aria-label={count > 0 ? `Meu Carrinho, ${count} ${count === 1 ? "peça salva" : "peças salvas"}` : "Meu Carrinho"}
      className="flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-text-muted hover:bg-muted"
    >
      <span className="text-xs font-semibold text-text">Meu Carrinho</span>
      <BagIcon active={count > 0} />
      {count > 0 && <span className="text-xs font-medium text-text">{count}</span>}
    </Link>
  );
}

function BagIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={active ? "text-primary" : undefined}
    >
      <path d="M6 8h12l-1 12.5a2 2 0 0 1-2 1.5H9a2 2 0 0 1-2-1.5L6 8Z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
    </svg>
  );
}
