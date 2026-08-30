"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface CategoryCarouselItem {
  key: string;
  name: string;
  href: string;
}

/**
 * Carrossel horizontal de categorias — mesma técnica de scroll nativo da
 * ProductGallery (CSS scroll-snap, sem lib de carrossel), mas com os chips
 * em largura de conteúdo (não 100%) em vez de um por tela: isso já produz
 * o efeito de "espiar" a próxima categoria de graça, sem nenhum cálculo
 * extra. Setas são só um atalho de desktop (hover); no touch o arrastar
 * nativo já basta.
 */
export function CategoryCarousel({ items }: { items: CategoryCarouselItem[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const rafRef = useRef<number | null>(null);

  function updateArrows() {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  function handleScroll() {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      updateArrows();
    });
  }

  useEffect(() => {
    updateArrows();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [items.length]);

  function scrollByAmount(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: "smooth" });
  }

  if (items.length === 0) return null;

  return (
    <div className="relative min-w-0">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-proximity gap-2.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [overscroll-behavior-x:contain] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="shrink-0 snap-start whitespace-nowrap rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-muted"
          >
            {item.name}
          </Link>
        ))}
        {/* Espaçador final: garante que o último chip "espie" cortado na
            borda mesmo quando quase todos cabem na tela. */}
        <div aria-hidden="true" className="w-6 shrink-0" />
      </div>

      {canScrollLeft && (
        <button
          type="button"
          aria-label="Categorias anteriores"
          onClick={() => scrollByAmount(-1)}
          className="absolute left-0 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-white/90 text-text shadow-sm backdrop-blur-sm transition-opacity hover:bg-white sm:flex"
        >
          <ChevronIcon direction="left" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          aria-label="Mais categorias"
          onClick={() => scrollByAmount(1)}
          className="absolute right-0 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-white/90 text-text shadow-sm backdrop-blur-sm transition-opacity hover:bg-white sm:flex"
        >
          <ChevronIcon direction="right" />
        </button>
      )}
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  const d = direction === "left" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6";
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
