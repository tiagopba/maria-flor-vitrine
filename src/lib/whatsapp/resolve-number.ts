import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type WhatsappMode = "DEFAULT" | "CHOOSE_SELLER" | "ROUND_ROBIN";

export interface ResolvedSeller {
  sellerId: string | null;
  whatsappNumber: string;
}

/**
 * Resolve para qual número o clique deve ir, de acordo com WHATSAPP_MODE em
 * site_settings. Roda só no servidor (rota /api/whatsapp/click) para manter
 * a lógica de distribuição fora do client e poder registrar seller_id no
 * evento de analytics.
 *
 * MVP: DEFAULT (número fixo do .env) e ROUND_ROBIN (alterna por order_priority)
 * implementados. CHOOSE_SELLER fica preparado para quando a cliente puder
 * escolher a vendedora na UI.
 */
export async function resolveWhatsappTarget(preferredSellerId?: string): Promise<ResolvedSeller> {
  const supabase = createAdminClient();

  const { data: settingRow } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "WHATSAPP_MODE")
    .maybeSingle();

  const mode = (settingRow?.value as WhatsappMode | undefined) ?? "DEFAULT";

  if (mode === "CHOOSE_SELLER" && preferredSellerId) {
    const { data: seller } = await supabase
      .from("sellers")
      .select("id, whatsapp_number")
      .eq("id", preferredSellerId)
      .eq("active", true)
      .maybeSingle();

    if (seller) return { sellerId: seller.id, whatsappNumber: seller.whatsapp_number };
  }

  if (mode === "ROUND_ROBIN") {
    const { data: sellers } = await supabase
      .from("sellers")
      .select("id, whatsapp_number")
      .eq("active", true)
      .order("order_priority", { ascending: true });

    if (sellers && sellers.length > 0) {
      const index = Math.floor(Date.now() / 1000) % sellers.length;
      const seller = sellers[index];
      return { sellerId: seller.id, whatsappNumber: seller.whatsapp_number };
    }
  }

  const defaultNumber = process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT_NUMBER ?? "";
  return { sellerId: null, whatsappNumber: defaultNumber };
}
