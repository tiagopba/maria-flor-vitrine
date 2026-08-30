"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type GalleryImage = { url: string; alt_text: string | null };

/**
 * Galeria com swipe real: a "foto principal" é um scroller horizontal nativo
 * com CSS scroll-snap (sem lib de carrossel, sem handler de touch escrito na
 * mão) — o navegador já resolve sozinho "gesto claramente horizontal desliza
 * a foto, gesto vertical rola a página", inclusive pinch-zoom, porque nada
 * aqui chama preventDefault em touch. `overscroll-behavior-x: contain`
 * evita só que o bounce horizontal (iOS) vaze pra página nas pontas.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: GalleryImage[];
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rafRef = useRef<number | null>(null);

  const hasMultiple = images.length > 1;
  const showDots = hasMultiple && images.length <= 8;

  function scrollToIndex(index: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ left: index * scroller.clientWidth, behavior: "smooth" });
    setActiveIndex(index);
  }

  function handleScroll() {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const scroller = scrollerRef.current;
      if (!scroller || scroller.clientWidth === 0) return;
      const index = Math.round(scroller.scrollLeft / scroller.clientWidth);
      setActiveIndex((current) => (current === index ? current : index));
    });
  }

  useEffect(() => {
    thumbRefs.current[activeIndex]?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activeIndex]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft" && activeIndex > 0) {
      e.preventDefault();
      scrollToIndex(activeIndex - 1);
    } else if (e.key === "ArrowRight" && activeIndex < images.length - 1) {
      e.preventDefault();
      scrollToIndex(activeIndex + 1);
    }
  }

  if (images.length === 0) {
    return (
      <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl bg-muted text-sm text-text-muted">
        Sem fotos
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="group relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-muted"
        role="group"
        aria-label={`Galeria de fotos — ${productName}`}
        aria-roledescription="carrossel"
        tabIndex={hasMultiple ? 0 : -1}
        onKeyDown={hasMultiple ? handleKeyDown : undefined}
      >
        <div
          ref={scrollerRef}
          onScroll={hasMultiple ? handleScroll : undefined}
          className={cn(
            "flex h-full snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            hasMultiple && "[overscroll-behavior-x:contain]"
          )}
        >
          {images.map((image, index) => (
            <div key={image.url} className="relative h-full w-full shrink-0 snap-center">
              <Image
                src={image.url}
                alt={image.alt_text ?? `${productName} — foto ${index + 1} de ${images.length}`}
                fill
                priority={index === 0}
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        {hasMultiple && (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={() => scrollToIndex(activeIndex - 1)}
              disabled={activeIndex === 0}
              className="absolute left-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-white/85 text-text shadow-sm backdrop-blur-sm transition-opacity hover:bg-white disabled:pointer-events-none disabled:opacity-0 sm:flex"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              aria-label="Próxima foto"
              onClick={() => scrollToIndex(activeIndex + 1)}
              disabled={activeIndex === images.length - 1}
              className="absolute right-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-white/85 text-text shadow-sm backdrop-blur-sm transition-opacity hover:bg-white disabled:pointer-events-none disabled:opacity-0 sm:flex"
            >
              <ChevronIcon direction="right" />
            </button>

            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
              {showDots ? (
                <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1.5 backdrop-blur-sm">
                  {images.map((image, index) => (
                    <span
                      key={image.url}
                      className={cn(
                        "h-1.5 rounded-full bg-white transition-all",
                        index === activeIndex ? "w-3.5 opacity-100" : "w-1.5 opacity-50"
                      )}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
                  aria-live="polite"
                >
                  {activeIndex + 1} / {images.length}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              ref={(el) => {
                thumbRefs.current[index] = el;
              }}
              onClick={() => scrollToIndex(index)}
              aria-label={`Ver foto ${index + 1} de ${images.length}`}
              aria-current={index === activeIndex}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted ring-2 transition-all",
                index === activeIndex ? "ring-primary" : "ring-transparent"
              )}
            >
              <Image src={image.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
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
