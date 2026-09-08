"use client";

import { useEffect, useRef } from "react";
import { recordAnalyticsEvent } from "@/lib/analytics/track";
import { trackViewContent } from "@/lib/analytics/meta-pixel";
import { sendViewContentCapi } from "@/lib/analytics/capi-actions";
import { getDeviceType } from "@/lib/analytics/device";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";

/**
 * ViewProduct (analytics interno, PRODUCT_VIEW) + ViewContent (Meta Pixel)
 * — só dispara uma vez por produto realmente montado na tela (troca de cor
 * pelo slider já usa `history.replaceState`, então o componente da página
 * não remonta e isso não conta como uma nova visualização; ver
 * NavigationTracker/ProductDetailView).
 */
export function ProductViewTracker({
  productId,
  categoryId,
  code,
  name,
  price,
}: {
  productId: string;
  categoryId: string;
  code: string;
  name: string;
  price: number;
}) {
  const trackedFor = useRef<string | null>(null);

  useEffect(() => {
    if (trackedFor.current === productId) return;
    trackedFor.current = productId;

    const utm = captureAndPersistUtm();
    recordAnalyticsEvent({
      eventType: "PRODUCT_VIEW",
      sessionId: getVisitorSessionId(),
      productId,
      categoryId,
      source: "product_page",
      deviceType: getDeviceType(),
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
    }).catch(() => {});

    // Mesmo event_id nos dois lados (Pixel do browser + Conversions API) —
    // gerado só aqui, depois do guard acima, uma vez por visualização real.
    const eventId = crypto.randomUUID();
    trackViewContent({ code, name, price }, eventId);
    sendViewContentCapi({
      eventId,
      eventSourceUrl: window.location.href,
      productCode: code,
      productName: name,
      price,
    }).catch(() => {});
  }, [productId, categoryId, code, name, price]);

  return null;
}
