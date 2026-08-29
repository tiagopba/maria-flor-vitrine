"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildFavoritesWhatsAppMessage, buildWhatsAppUrl } from "./message-builder";
import { resolveSeller } from "./resolve-seller";

export interface FavoritesWhatsAppItem {
  productId: string;
  size: string | null;
}

export interface FavoritesWhatsAppInput {
  items: FavoritesWhatsAppItem[];
  /** null = "qualquer vendedora" (round-robin); string = escolha manual */
  sellerId: string | null;
  sessionId: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
}

export type FavoritesWhatsAppResult = { url: string } | { error: string };

/**
 * Mesmo espírito de submitWhatsAppClick (click-action.ts), mas para a
 * seleção inteira de /favoritos: busca os produtos direto do banco (nunca
 * confia em preço/nome vindos do client), monta uma mensagem só com as
 * peças ainda disponíveis, resolve a vendedora com a MESMA função
 * (resolve-seller.ts — nada de round-robin duplicado) e registra
 * FAVORITES_WHATSAPP_CLICK.
 */
export async function submitFavoritesWhatsAppClick(
  input: FavoritesWhatsAppInput
): Promise<FavoritesWhatsAppResult> {
  // A única forma de chegar aqui com items vazio é o client já ter
  // filtrado todas as peças SOLD_OUT antes de montar a seleção (a página
  // não deixa abrir esse fluxo com zero favoritos).
  if (input.items.length === 0) return { error: "Nenhuma peça disponível para enviar no momento." };

  const supabase = createAdminClient();
  const ids = input.items.map((item) => item.productId);

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, code, price, promotional_price, status")
    .in("id", ids);

  if (productsError) return { error: "Não foi possível carregar as peças selecionadas." };

  const sizeByProductId = new Map(input.items.map((item) => [item.productId, item.size]));

  // SOLD_OUT não entra "junto das peças disponíveis" no pedido de
  // disponibilidade normal (regra explícita do módulo de Favoritos) —
  // ARCHIVED/excluído também não deveria chegar aqui, mas o filtro cobre
  // os dois por segurança.
  const available = (products ?? []).filter(
    (p) => p.status !== "ARCHIVED" && p.status !== "SOLD_OUT"
  );

  if (available.length === 0) {
    return { error: "Nenhuma peça disponível para enviar no momento." };
  }

  const { seller, selectionMode } = await resolveSeller(supabase, input.sellerId);
  if (!seller) return { error: "Nenhuma vendedora disponível no momento." };

  const message = buildFavoritesWhatsAppMessage(
    available.map((p) => ({
      productName: p.name,
      code: p.code,
      price: p.promotional_price ?? p.price,
      size: sizeByProductId.get(p.id) ?? undefined,
    }))
  );

  const { error: insertError } = await supabase.from("analytics_events").insert({
    event_type: "FAVORITES_WHATSAPP_CLICK",
    session_id: input.sessionId,
    seller_id: seller.id,
    source: "favorites_page",
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    utm_content: input.utmContent,
    referrer: input.referrer,
    metadata: {
      favorites_count: input.items.length,
      available_products_count: available.length,
      selection_mode: selectionMode,
    },
  });

  if (insertError) {
    // Não bloqueia a conversa por causa de uma falha no registro do evento
    // (mesmo padrão de click-action.ts). Se FAVORITES_WHATSAPP_CLICK ainda
    // não existir na constraint do banco, é exatamente isso que acontece
    // aqui — falha logada, sem quebrar o envio.
    console.error("[submitFavoritesWhatsAppClick] falha ao registrar analytics_events:", insertError.message);
  }

  return { url: buildWhatsAppUrl(seller.whatsapp_number, message) };
}
