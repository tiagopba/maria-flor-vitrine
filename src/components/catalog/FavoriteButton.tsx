"use client";

import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { toggleFavorite } from "@/lib/favorites/storage";
import { useIsFavorited } from "@/lib/favorites/useFavorites";
import { recordFavoriteEvent } from "@/lib/favorites/analytics";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { getPersistedUtm } from "@/lib/utm/persist";
import { trackPixelEvent } from "@/lib/analytics/meta-pixel";

/**
 * Coração de favoritar — usado no ProductCard (dentro de um <Link>, por
 * isso o stopPropagation/preventDefault) e na página individual do
 * produto. Instantâneo: o toggle no localStorage já muda o ícone antes de
 * qualquer resposta de rede; o registro em analytics_events acontece em
 * segundo plano e nunca bloqueia nem desfaz a ação visual.
 */
export function FavoriteButton({
  productId,
  className,
  size = "md",
}: {
  productId: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const favorited = useIsFavorited(productId);
  const [, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const nowFavorited = toggleFavorite(productId);

    if (nowFavorited) {
      trackPixelEvent("AddToWishlist", { content_ids: [productId], content_type: "product" });
    }

    startTransition(() => {
      const utm = getPersistedUtm();
      recordFavoriteEvent({
        eventType: nowFavorited ? "FAVORITE_ADDED" : "FAVORITE_REMOVED",
        productId,
        sessionId: getVisitorSessionId(),
        utmSource: utm.utm_source ?? null,
        utmMedium: utm.utm_medium ?? null,
        utmCampaign: utm.utm_campaign ?? null,
        utmContent: utm.utm_content ?? null,
        referrer: utm.referrer ?? null,
      }).catch(() => {
        // Silencioso de propósito — nunca deve incomodar a cliente por
        // causa de uma falha só no registro do evento.
      });
    });
  }

  const dimension = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const iconSize = size === "sm" ? 15 : 17;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={favorited ? "Remover dos favoritos" : "Favoritar"}
      aria-pressed={favorited}
      className={cn(
        "flex items-center justify-center rounded-full bg-white/80 text-text/70 transition-colors hover:text-primary",
        dimension,
        className
      )}
    >
      <HeartIcon filled={favorited} size={iconSize} />
    </button>
  );
}

function HeartIcon({ filled, size }: { filled: boolean; size: number }) {
  const path =
    "M12 21s-6.7-4.35-9.3-8.1C1 10.1 1.8 6.6 4.9 5.3c2.1-.9 4.2 0 5.6 1.9L12 8.7l1.5-1.5c1.4-1.9 3.5-2.8 5.6-1.9 3.1 1.3 3.9 4.8 2.2 7.6C18.7 16.65 12 21 12 21z";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      className={filled ? "text-primary" : undefined}
    >
      <path d={path} />
    </svg>
  );
}
