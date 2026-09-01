"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AnalyticsEventType } from "@/types/database";

/**
 * Núcleo padronizado de instrumentação — generalização de
 * `lib/favorites/analytics.ts`/`lib/institutional/analytics.ts` (mantidos
 * como estão, já testados e em produção) pra qualquer `event_type` novo
 * (PAGE_VIEW, CATEGORY_VIEW, PRODUCT_VIEW, SEARCH, OFFER_LEAD_CONFIRMED).
 * Mesmo padrão fire-and-forget: falha aqui nunca bloqueia nem desfaz a ação
 * real da cliente.
 */
export interface RecordAnalyticsEventInput {
  eventType: AnalyticsEventType;
  sessionId: string;
  productId?: string | null;
  categoryId?: string | null;
  sellerId?: string | null;
  size?: string | null;
  source?: string | null;
  deviceType?: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("analytics_events").insert({
    event_type: input.eventType,
    session_id: input.sessionId,
    product_id: input.productId ?? null,
    category_id: input.categoryId ?? null,
    seller_id: input.sellerId ?? null,
    size: input.size ?? null,
    source: input.source ?? null,
    device_type: input.deviceType ?? null,
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    utm_content: input.utmContent,
    referrer: input.referrer,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error(`[recordAnalyticsEvent:${input.eventType}] falha ao registrar analytics_events:`, error.message);
  }
}
