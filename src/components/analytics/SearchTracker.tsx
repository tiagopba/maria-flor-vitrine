"use client";

import { useEffect, useRef } from "react";
import { recordAnalyticsEvent } from "@/lib/analytics/track";
import { trackPixelEvent } from "@/lib/analytics/meta-pixel";
import { getDeviceType } from "@/lib/analytics/device";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";

/**
 * Search (analytics interno, SEARCH) + Search (Meta Pixel) — só quando uma
 * busca de verdade rodou (query ou filtro ativo), nunca no estado inicial
 * vazio da página /busca. Uma vez por termo/filtro (evita duplicar em
 * re-renders da mesma busca).
 */
export function SearchTracker({
  active,
  query,
  resultsCount,
}: {
  active: boolean;
  query: string;
  resultsCount: number;
}) {
  const trackedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const key = `${query}::${resultsCount}`;
    if (trackedFor.current === key) return;
    trackedFor.current = key;

    const utm = captureAndPersistUtm();
    recordAnalyticsEvent({
      eventType: "SEARCH",
      sessionId: getVisitorSessionId(),
      source: "busca",
      deviceType: getDeviceType(),
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
      metadata: { query, results_count: resultsCount },
    }).catch(() => {});

    if (query) trackPixelEvent("Search", { search_string: query });
  }, [active, query, resultsCount]);

  return null;
}
