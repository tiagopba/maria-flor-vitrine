"use client";

import { useEffect, useRef } from "react";
import { recordAnalyticsEvent } from "@/lib/analytics/track";
import { getDeviceType } from "@/lib/analytics/device";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";

/** ViewCategory (analytics interno, CATEGORY_VIEW) — uma vez por categoria montada. */
export function CategoryViewTracker({ categoryId }: { categoryId: string }) {
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
  }, [categoryId]);

  return null;
}
