"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Shirt, ShoppingBag, Sparkles, Star, Tag, type LucideIcon } from "lucide-react";

export type CategoryIconKey = "sparkles" | "star" | "shopping-bag" | "shirt" | "tag";

export interface CategoryCarouselItem {
  key: string;
  name: string;
  href: string;
  icon: CategoryIconKey;
}

const ICONS: Record<CategoryIconKey, LucideIcon> = {
  sparkles: Sparkles,
  star: Star,
  "shopping-bag": ShoppingBag,
  shirt: Shirt,
  tag: Tag,
};

/**
 * Carrossel horizontal de categorias — mesma técnica de scroll nativo da
 * ProductGallery (CSS scroll-snap, sem lib de carrossel), mas com os cards
 * em largura de conteúdo (não 100%) em vez de um por tela: isso já produz
 * o efeito de "espiar" a próxima categoria de graça, sem nenhum cálculo
 * extra. Setas são só um atalho de desktop (hover); no touch o arrastar
 * nativo já basta.
 *
 * `icon` é uma chave (não o componente do ícone em si) porque este item é
 * montado no servidor (buildExploreCategoriesItems) e passado como prop
 * pra este Client Component — uma referência de função/componente não
 * atravessa essa fronteira serializável, só um valor simples como string.
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
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <Link
              key={item.key}
              href={item.href}
              className="flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-accent/20 hover:border-accent/60"
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {item.name}
            </Link>
          );
        })}
        {/* Espaçador final: garante que o último card "espie" cortado na
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
          <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          aria-label="Mais categorias"
          onClick={() => scrollByAmount(1)}
          className="absolute right-0 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-white/90 text-text shadow-sm backdrop-blur-sm transition-opacity hover:bg-white sm:flex"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
