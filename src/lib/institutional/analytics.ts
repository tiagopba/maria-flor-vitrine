"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface RecordInstitutionalEventInput {
  eventType: "OFFERS_PAGE_VIEW" | "OFFER_LEAD_SUBMITTED" | "OFFERS_GROUP_CLICK" | "STORE_DIRECTIONS_CLICK";
  sessionId: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Eventos do módulo institucional (Ofertas/Como Chegar) em analytics_events
 * — mesmo padrão fire-and-forget de `lib/favorites/analytics.ts`: falha
 * aqui nunca deve impedir a ação real (enviar o formulário, abrir o Maps).
 *
 * Os quatro event_type ainda não estão na constraint do banco — enquanto a
 * migration aditiva não for aprovada e aplicada, o insert falha e fica só
 * no log (mesmo padrão já usado em todo o projeto).
 */
export async function recordInstitutionalEvent(input: RecordInstitutionalEventInput): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("analytics_events").insert({
    event_type: input.eventType,
    session_id: input.sessionId,
    source: "institutional",
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    utm_content: input.utmContent,
    referrer: input.referrer,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error(`[recordInstitutionalEvent:${input.eventType}] falha ao registrar analytics_events:`, error.message);
  }
}
