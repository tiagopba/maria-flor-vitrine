"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CATEGORY_ICON_REGISTRY } from "@/lib/catalog/category-icons";
import type { ExploreCategoryItem } from "@/lib/catalog/explore-categories";

export type CategoryCarouselItem = ExploreCategoryItem;

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
 * A chave é resolvida pro componente de verdade aqui dentro, via
 * CATEGORY_ICON_REGISTRY (lib/catalog/category-icons.ts) — único lugar
 * que conhece a lista de ícones disponíveis.
 *
 * `variant="grid"` é só usado na Home (logo abaixo da busca): em vez do
 * carrossel de uma linha só com scroll/setas, os chips formam uma grade
 * responsiva (2 colunas no mobile comum, 3 em telas mobile maiores) —
 * paginada em blocos de GRID_PAGE_SIZE, com setas + pontinhos de página em
 * vez de scroll/expandir. As outras páginas que reaproveitam este
 * componente (produto, categoria, busca, novidades, favoritos) continuam
 * com `variant="scroll"` (padrão), comportamento inalterado.
 *
 * Só no `variant="grid"`: Novidades sempre primeiro (mesma chave especial
 * que buildExploreCategoriesItems já usa pra montar o item), as demais em
 * ordem alfabética pelo nome — puramente de exibição aqui, não reordena
 * nada vindo do banco/admin nem afeta a ordem usada pelo carrossel normal
 * em outras páginas. A altura da grade é reservada pro tamanho de uma
 * página cheia (`GRID_MIN_HEIGHT_CLASSES`) pra não pular quando a última
 * página tiver menos itens. Setas desabilitam nas pontas (sem loop);
 * swipe horizontal no touch é só matemática de deltaX/deltaY no
 * touchstart/touchend, sem lib nova.
 */
const GRID_PAGE_SIZE = 6;
const GRID_MIN_HEIGHT_CLASSES = "min-h-[152px] min-[430px]:min-h-[98px]";
const SWIPE_THRESHOLD_PX = 40;

export function CategoryCarousel({
  items,
  variant = "scroll",
}: {
  items: CategoryCarouselItem[];
  variant?: "scroll" | "grid";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [gridPage, setGridPage] = useState(0);
  const gridFadeRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Fade curto a cada troca de página do grid — manipula o DOM direto (via
  // ref) em vez de setState, pra não disparar um re-render em cascata só
  // pra tocar uma transição puramente visual.
  useEffect(() => {
    const el = gridFadeRef.current;
    if (!el) return;
    el.style.opacity = "0";
    const id = requestAnimationFrame(() => {
      el.style.opacity = "1";
    });
    return () => cancelAnimationFrame(id);
  }, [gridPage]);

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

  if (variant === "grid") {
    const novidades = items.find((item) => item.key === "novidades");
    const rest = items
      .filter((item) => item.key !== "novidades")
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const sortedItems = novidades ? [novidades, ...rest] : rest;
    const totalPages = Math.max(1, Math.ceil(sortedItems.length / GRID_PAGE_SIZE));
    const safePage = Math.min(gridPage, totalPages - 1);
    const pageItems = sortedItems.slice(safePage * GRID_PAGE_SIZE, safePage * GRID_PAGE_SIZE + GRID_PAGE_SIZE);

    function goToPage(index: number) {
      setGridPage(Math.max(0, Math.min(totalPages - 1, index)));
    }

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }

    function handleTouchEnd(e: TouchEvent) {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY)) return;
      goToPage(deltaX < 0 ? safePage + 1 : safePage - 1);
    }

    return (
      <div>
        <div
          ref={gridFadeRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`grid grid-cols-2 gap-2.5 ${GRID_MIN_HEIGHT_CLASSES} min-[430px]:grid-cols-3 transition-opacity duration-200`}
        >
          {pageItems.map((item) => {
            const Icon = CATEGORY_ICON_REGISTRY[item.icon].Icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-accent/40 bg-accent/10 px-3 py-2.5 text-center text-sm font-medium text-primary transition-colors hover:bg-accent/20 hover:border-accent/60"
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="Categorias anteriores"
              disabled={safePage === 0}
              onClick={() => goToPage(safePage - 1)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-accent/10 text-primary transition-colors hover:bg-accent/20 hover:border-primary/60 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
            </button>

            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }).map((_, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    index === safePage ? "bg-primary" : "bg-primary/25"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              aria-label="Mais categorias"
              disabled={safePage === totalPages - 1}
              onClick={() => goToPage(safePage + 1)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-accent/10 text-primary transition-colors hover:bg-accent/20 hover:border-primary/60 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-proximity gap-2.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [overscroll-behavior-x:contain] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const Icon = CATEGORY_ICON_REGISTRY[item.icon].Icon;
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
