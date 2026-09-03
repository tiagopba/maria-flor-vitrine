"use client";

import { useEffect, useRef } from "react";
import { recordAnalyticsEvent } from "@/lib/analytics/track";
import { trackPixelCustomEvent } from "@/lib/analytics/meta-pixel";
import { getDeviceType } from "@/lib/analytics/device";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";

/**
 * CATEGORY_VIEW (analytics interno) + ViewCategory (Meta Pixel, evento
 * custom) — uma vez por categoria realmente montada (só existe em
 * /categoria/[slug], então nunca dispara em /novidades, /busca, /favoritos
 * ou página de produto, que não renderizam este componente). `trackedFor`
 * evita duplicar em re-render/hydration: só dispara de novo se `categoryId`
 * realmente mudar (navegação pra outra categoria).
 */
export function CategoryViewTracker({
  categoryId,
  categoryName,
  categorySlug,
}: {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
}) {
  const trackedFor = useRef<string | null>(null);

  useEffect(() => {
    if (trackedFor.current === categoryId) return;
    trackedFor.current = categoryId;

    const utm = captureAndPersistUtm();
    recordAnalyticsEvent({
      eventType: "CATEGORY_VIEW",
      sessionId: getVisitorSessionId(),
      categoryId,
      source: "category_page",
      deviceType: getDeviceType(),
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
    }).catch(() => {});

    trackPixelCustomEvent("ViewCategory", {
      category_name: categoryName,
      category_slug: categorySlug,
    });
  }, [categoryId, categoryName, categorySlug]);

  return null;
}
