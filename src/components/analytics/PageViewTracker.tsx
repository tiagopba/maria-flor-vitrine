"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordAnalyticsEvent } from "@/lib/analytics/track";
import { getDeviceType } from "@/lib/analytics/device";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";

/**
 * PAGE_VIEW genérico — uma linha por navegação (inicial + client-side)
 * dentro do site público. É a base do card "Visualizações da vitrine" do
 * dashboard; PRODUCT_VIEW/CATEGORY_VIEW (trackers próprios, nas respectivas
 * páginas) continuam medindo especificamente produto/categoria por cima
 * disso, sem duplicar responsabilidade.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    const path = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    if (lastTracked.current === path) return;
    lastTracked.current = path;

    const utm = captureAndPersistUtm();
    recordAnalyticsEvent({
      eventType: "PAGE_VIEW",
      sessionId: getVisitorSessionId(),
      source: pathname,
      deviceType: getDeviceType(),
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
      metadata: { path },
    }).catch(() => {});
  }, [pathname, searchParams]);

  return null;
}
