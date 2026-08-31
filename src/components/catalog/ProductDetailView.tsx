"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { DualPriceBlock, Price } from "@/components/ui/Price";
import { FavoriteButton } from "@/components/catalog/FavoriteButton";
import { ProductWhatsAppFlow } from "@/components/catalog/ProductWhatsAppFlow";
import { resolveProductPricing } from "@/lib/catalog/pricing";
import { PRODUCT_STATUS_LABELS, publicStatusBadge } from "@/lib/catalog/status";
import type { ProductDetail } from "@/lib/db/products";
import type { PaymentSettings } from "@/lib/site-settings/payments";
import { cn } from "@/lib/utils";

interface Slide {
  memberIndex: number;
  url: string;
  alt: string;
}

/**
 * Página do produto (galeria + painel de informações) com navegação
 * contínua entre as cores do mesmo modelo — deslizar/setear além da
 * última foto de uma cor entra direto na próxima cor, sem precisar clicar
 * no chip (ver rodada de correções: "slider contínuo entre cores").
 *
 * NUNCA junta produtos no banco: `members` é sempre uma lista de
 * `ProductDetail` reais e independentes (cada cor = 1 linha em
 * `products`, com código/fotos/tamanhos/preço/slug próprios) — isso aqui
 * só decide qual fatia mostrar e quando trocar.
 *
 * Clique manual num chip de cor continua sendo uma navegação de verdade
 * (<Link>, histórico normal). Só a troca de cor pelo gesto de deslizar
 * (ou pelas setas) usa `history.replaceState` pra manter a URL certa sem
 * criar uma entrada nova no histórico a cada foto — sem isso, "voltar" no
 * navegador teria que desfazer cada foto deslizada uma por uma.
 */
export function ProductDetailView({
  members,
  initialActiveId,
  paymentSettings,
  sellers,
}: {
  members: ProductDetail[];
  initialActiveId: string;
  paymentSettings: PaymentSettings;
  sellers: { id: string; name: string }[];
}) {
  const initialIndex = Math.max(
    0,
    members.findIndex((m) => m.id === initialActiveId)
  );
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const active = members[activeIndex];

  const slides = useMemo<Slide[]>(
    () =>
      members.flatMap((m, mi) => m.images.map((img) => ({ memberIndex: mi, url: img.url, alt: img.alt_text ?? m.name }))),
    [members]
  );

  // Índice global (entre TODAS as cores) do primeiro slide de cada membro.
  const memberSlideStart = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const m of members) {
      starts.push(acc);
      acc += m.images.length;
    }
    return starts;
  }, [members]);

  const [activeSlideIndex, setActiveSlideIndex] = useState(memberSlideStart[initialIndex] ?? 0);
  const localSlideIndex = activeSlideIndex - memberSlideStart[activeIndex];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rafRef = useRef<number | null>(null);
  // Espelham activeSlideIndex/activeIndex de forma síncrona (nunca esperam
  // o próximo render) — sem isso, dois cliques na seta mais rápidos do que
  // o React consegue re-renderizar leriam o MESMO índice "antigo" do
  // fechamento do botão, e o segundo clique não avançaria nada (mesma
  // categoria do bug do upload de várias fotos: sempre calcular o próximo
  // estado a partir do estado mais recente de verdade, nunca de uma
  // variável capturada no render em que o handler foi criado).
  const activeSlideIndexRef = useRef(activeSlideIndex);
  const activeIndexRef = useRef(activeIndex);

  // Posiciona o scroller na primeira foto da cor inicial assim que monta,
  // sem animação — senão a cliente veria a galeria "deslizar sozinha" ao
  // abrir a página (as fotos das cores anteriores na sequência ficam à
  // esquerda, fora de vista, prontas pra deslizar de volta — item 4/5).
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollLeft = (memberSlideStart[initialIndex] ?? 0) * scroller.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    thumbRefs.current[localSlideIndex]?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [localSlideIndex]);

  // Setas e miniaturas atualizam o estado (dots/URL/preço/tamanhos) na
  // hora — nunca esperam só o evento de scroll (que passa por
  // requestAnimationFrame em handleScroll) pra refletir a mudança. Deixar
  // só no scroll-driven faria clique de seta/miniatura ficar visualmente
  // atrasado (ou, em navegadores/telas que atrasam o rAF, nem atualizar).
  function scrollToSlide(index: number) {
    const clamped = Math.max(0, Math.min(index, slides.length - 1));
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTo({ left: clamped * scroller.clientWidth, behavior: "smooth" });
    applyActiveSlide(clamped);
  }

  function applyActiveSlide(index: number) {
    activeSlideIndexRef.current = index;
    setActiveSlideIndex(index);
    const slide = slides[index];
    if (!slide || slide.memberIndex === activeIndexRef.current) return;

    activeIndexRef.current = slide.memberIndex;
    setActiveIndex(slide.memberIndex);
    const newActive = members[slide.memberIndex];
    // Só a URL muda (sem navegação/refetch — já temos os dados completos
    // dessa cor em `members`) e sem empilhar uma entrada nova no histórico.
    window.history.replaceState(null, "", `/produto/${newActive.slug}`);
  }

  function handleScroll() {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const scroller = scrollerRef.current;
      if (!scroller || scroller.clientWidth === 0) return;
      const index = Math.round(scroller.scrollLeft / scroller.clientWidth);
      applyActiveSlide(index);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollToSlide(activeSlideIndexRef.current - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollToSlide(activeSlideIndexRef.current + 1);
    }
  }

  const memberSlideCount = active.images.length;
  const hasMultipleSlides = slides.length > 1;
  const memberHasMultiplePhotos = memberSlideCount > 1;
  const showDots = memberHasMultiplePhotos && memberSlideCount <= 8;
  const showCounter = memberHasMultiplePhotos && !showDots;

  const badge = publicStatusBadge(active.status);
  const isSoldOut = active.status === "SOLD_OUT";
  const pricing = resolveProductPricing(active, paymentSettings);

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        {slides.length === 0 ? (
          <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl bg-muted text-sm text-text-muted">
            Sem fotos
          </div>
        ) : (
          <div
            className="group relative aspect-[3/4] w-full min-w-0 overflow-hidden rounded-xl bg-muted"
            role="group"
            aria-label={`Galeria de fotos — ${active.name}`}
            aria-roledescription="carrossel"
            tabIndex={hasMultipleSlides ? 0 : -1}
            onKeyDown={hasMultipleSlides ? handleKeyDown : undefined}
          >
            <div
              ref={scrollerRef}
              onScroll={hasMultipleSlides ? handleScroll : undefined}
              className={cn(
                "flex h-full snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                hasMultipleSlides && "[overscroll-behavior-x:contain]"
              )}
            >
              {slides.map((slide, index) => (
                <div key={`${slide.memberIndex}-${slide.url}`} className="relative h-full w-full shrink-0 snap-center">
                  <Image
                    src={slide.url}
                    alt={slide.alt}
                    fill
                    priority={index === (memberSlideStart[initialIndex] ?? 0)}
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>

            {hasMultipleSlides && (
              <>
                <button
                  type="button"
                  aria-label="Foto anterior"
                  onClick={() => scrollToSlide(activeSlideIndexRef.current - 1)}
                  disabled={activeSlideIndex === 0}
                  className="absolute left-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-white/85 text-text shadow-sm backdrop-blur-sm transition-opacity hover:bg-white disabled:pointer-events-none disabled:opacity-0 sm:flex"
                >
                  <ChevronIcon direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Próxima foto"
                  onClick={() => scrollToSlide(activeSlideIndexRef.current + 1)}
                  disabled={activeSlideIndex === slides.length - 1}
                  className="absolute right-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-white/85 text-text shadow-sm backdrop-blur-sm transition-opacity hover:bg-white disabled:pointer-events-none disabled:opacity-0 sm:flex"
                >
                  <ChevronIcon direction="right" />
                </button>

                {(showDots || showCounter) && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
                    {showDots ? (
                      <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1.5 backdrop-blur-sm">
                        {active.images.map((img, i) => (
                          <span
                            key={img.id}
                            className={cn(
                              "h-1.5 rounded-full bg-white transition-all",
                              i === localSlideIndex ? "w-3.5 opacity-100" : "w-1.5 opacity-50"
                            )}
                          />
                        ))}
                      </div>
                    ) : (
                      <div
                        className="rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
                        aria-live="polite"
                      >
                        {localSlideIndex + 1} / {memberSlideCount}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {memberHasMultiplePhotos && (
          <div className="flex gap-2 overflow-x-auto">
            {active.images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                ref={(el) => {
                  thumbRefs.current[i] = el;
                }}
                onClick={() => scrollToSlide(memberSlideStart[activeIndexRef.current] + i)}
                aria-label={`Ver foto ${i + 1} de ${memberSlideCount}`}
                aria-current={i === localSlideIndex}
                className={cn(
                  "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted ring-2 transition-all",
                  i === localSlideIndex ? "ring-primary" : "ring-transparent"
                )}
              >
                <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {active.categoryName && (
          <p className="text-xs uppercase tracking-wide text-text-muted">{active.categoryName}</p>
        )}

        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl text-text sm:text-3xl">{active.name}</h1>
          <FavoriteButton productId={active.id} className="shrink-0 bg-muted hover:bg-border" />
        </div>

        <div className="flex items-start gap-2">
          {pricing.model === "dual" ? (
            <DualPriceBlock pricing={pricing} variant="detail" />
          ) : (
            <Price product={active} paymentSettings={paymentSettings} />
          )}
          {badge && <Badge tone="warning">{badge}</Badge>}
        </div>

        {members.length > 1 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text">Outras cores disponíveis</span>
            <div className="flex flex-wrap gap-2">
              {members.map((m, i) => {
                const isActive = i === activeIndex;
                const label = m.colorName ?? "Ver cor";
                const dot = m.colorHex && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-primary/30"
                    style={{ backgroundColor: m.colorHex }}
                  />
                );

                if (isActive) {
                  return (
                    <span
                      key={m.id}
                      className="flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3.5 py-1.5 text-sm text-primary"
                    >
                      {dot}
                      {label}
                    </span>
                  );
                }

                return (
                  <Link
                    key={m.id}
                    href={`/produto/${m.slug}`}
                    className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm text-text transition-colors hover:border-primary/40"
                  >
                    {dot}
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <p className="font-sans text-xs text-text-muted">Código: {active.code}</p>

        {isSoldOut && <p className="text-sm font-medium text-red-600">{PRODUCT_STATUS_LABELS.SOLD_OUT}</p>}

        {active.description && (
          <p className="whitespace-pre-line font-sans text-sm font-normal leading-[1.6] text-text-muted sm:text-base">
            {active.description}
          </p>
        )}

        <p className="font-sans text-xs text-text-muted">
          Disponibilidade sujeita à confirmação devido ao giro rápido das peças.
        </p>

        <div className="mt-2">
          <ProductWhatsAppFlow
            key={active.id}
            productId={active.id}
            status={active.status}
            sizes={active.sizes}
            sellers={sellers}
          />
        </div>
      </div>
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
