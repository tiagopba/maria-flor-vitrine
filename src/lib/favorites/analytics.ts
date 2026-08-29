"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface RecordFavoriteEventInput {
  eventType: "FAVORITE_ADDED" | "FAVORITE_REMOVED" | "FAVORITES_VIEW";
  productId?: string | null;
  sessionId: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Registra eventos de Favoritos em analytics_events. Chamado em
 * "fire-and-forget" pelo client (não bloqueia o coração instantâneo nem o
 * carregamento da página) — falha aqui nunca deve impedir a ação real.
 *
 * FAVORITES_VIEW ainda não está na constraint de event_type do banco (só
 * FAVORITE_ADDED/FAVORITE_REMOVED existiam antes deste módulo) — enquanto
 * a migration aditiva não for aprovada e aplicada, chamadas com esse tipo
 * falham aqui e ficam só no log, sem quebrar nada. Ver docs/deployment.md
 * seção 4 e o aviso passado ao usuário nesta entrega.
 */
export async function recordFavoriteEvent(input: RecordFavoriteEventInput): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("analytics_events").insert({
    event_type: input.eventType,
    session_id: input.sessionId,
    product_id: input.productId ?? null,
    source: "favorites",
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
