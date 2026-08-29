import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Registrado no próprio Server Component de /selecao/[token] — falha aqui
 * nunca deve impedir a vendedora de ver a seleção.
 */
export async function recordSelectionViewed(token: string, itemsCount: number): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("analytics_events").insert({
    event_type: "SELECTION_VIEWED",
    session_id: token,
    source: "selection_page",
    metadata: { items_count: itemsCount },
  });

  if (error) {
    console.error("[recordSelectionViewed] falha ao registrar analytics_events:", error.message);
  }
}
