"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface RecordFavoriteEventInput {
  eventType:
    | "FAVORITE_ADDED"
    | "FAVORITE_REMOVED"
    | "FAVORITES_VIEW"
    | "PRODUCT_FLOW_STARTED"
    | "PRODUCT_FLOW_SEE_MORE_CLICK";
  productId?: string | null;
  sessionId: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
  metadata?: Record<string, unknown>;
  /** Default "favorites" (página /favoritos) — o fluxo guiado no produto
   * passa "product_page" pra distinguir a origem no funil. */
  source?: string;
}

/**
 * Registra eventos de Favoritos em analytics_events. Chamado em
 * "fire-and-forget" pelo client (não bloqueia o coração instantâneo nem o
 * carregamento da página) — falha aqui nunca deve impedir a ação real.
 *
 * Todos os event_type deste módulo (incluindo PRODUCT_FLOW_STARTED/
 * PRODUCT_FLOW_SEE_MORE_CLICK) já estão na constraint do banco.
 */
export async function recordFavoriteEvent(input: RecordFavoriteEventInput): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("analytics_events").insert({
    event_type: input.eventType,
    session_id: input.sessionId,
    product_id: input.productId ?? null,
    source: input.source ?? "favorites",
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    utm_content: input.utmContent,
    referrer: input.referrer,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error(`[recordFavoriteEvent:${input.eventType}] falha ao registrar analytics_events:`, error.message);
  }
}
