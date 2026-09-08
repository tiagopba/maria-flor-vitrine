"use server";

import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";
import { resolveProductPricing, resolveTrackingPrice } from "@/lib/catalog/pricing";
import { getColorNamesByIds } from "@/lib/db/colors";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import { sendCapiEvent } from "@/lib/analytics/meta-capi";
import { buildProductDoubtWhatsAppMessage, buildSoldOutWhatsAppMessage, buildWhatsAppUrl } from "./message-builder";
import { resolveSeller } from "./resolve-seller";

export interface WhatsAppClickInput {
  productId: string;
  size: string | null;
  /** null = "qualquer vendedora" (round-robin); string = escolha manual */
  sellerId: string | null;
  sessionId: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
  /**
   * Mesmo `event_id` usado em `fbq('track', 'Lead', ..., {eventID})` do
   * browser, pra Meta deduplicar — só usado quando o produto NÃO está
   * SOLD_OUT ("Quero algo parecido" continua sem Lead/CAPI, comportamento
   * inalterado). Ambos opcionais: sem eles, este fluxo simplesmente não
   * dispara CAPI, igual ao comportamento de sempre.
   */
  eventId?: string;
  eventSourceUrl?: string;
}

export type WhatsAppClickResult = { url: string } | { error: string };

/**
 * Resolve a vendedora, monta a mensagem com dados do produto direto do
 * banco (não confia em preço/nome vindos do client), registra o
 * WHATSAPP_CLICK em analytics_events e devolve a URL final do wa.me.
 *
 * Usa o client admin (service role) porque `analytics_events` e `sellers`
 * não têm policy de leitura/escrita para o visitante anônimo — a real
 * autorização aqui é "isso só roda dentro desta Server Action", nunca
 * exposto ao navegador.
 */
export async function submitWhatsAppClick(input: WhatsAppClickInput): Promise<WhatsAppClickResult> {
  const supabase = createAdminClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, code, slug, color_id, price, promotional_price, cash_price, max_installments_override, status")
    .eq("id", input.productId)
    .maybeSingle();

  if (productError) return { error: "Não foi possível carregar o produto." };
  if (!product || product.status === "ARCHIVED") return { error: "Produto não encontrado." };

  const { seller, selectionMode } = await resolveSeller(supabase, input.sellerId);
  if (!seller) return { error: "Nenhuma vendedora disponível no momento." };

  const paymentSettings = await getPaymentSettings();
  const pricing = resolveProductPricing(product, paymentSettings);
  const productUrl = `${getSiteUrl()}/produto/${product.slug}`;

  const colorName = product.color_id
    ? (await getColorNamesByIds(supabase, [product.color_id])).get(product.color_id)
    : undefined;

  const message =
    product.status === "SOLD_OUT"
      ? buildSoldOutWhatsAppMessage({ productName: product.name, code: product.code, colorName })
      : buildProductDoubtWhatsAppMessage({
          productName: product.name,
          code: product.code,
          colorName,
          price: pricing.model === "legacy" ? (pricing.promotionalPrice ?? pricing.price) : pricing.cardPrice,
          dualPrice:
            pricing.model === "dual"
              ? { cashPrice: pricing.cashPrice, cardPrice: pricing.cardPrice, installmentCount: pricing.installmentCount }
              : undefined,
          size: input.size ?? undefined,
          productUrl,
        });

  const { error: insertError } = await supabase.from("analytics_events").insert({
    event_type: "WHATSAPP_CLICK",
    session_id: input.sessionId,
    product_id: product.id,
    seller_id: seller.id,
    size: input.size,
    source: "product_page",
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    utm_content: input.utmContent,
    referrer: input.referrer,
    metadata: { selection_mode: selectionMode },
  });

  if (insertError) {
    // Não bloqueia a conversa por causa de uma falha no registro do evento.
    console.error("[submitWhatsAppClick] falha ao registrar analytics_events:", insertError.message);
  }

  // Conversions API — Lead server-side, só pro caminho "Tirar dúvidas"
  // (produto disponível + eventId informado pelo chamador). "Quero algo
  // parecido" (SOLD_OUT) nunca passa eventId, então nunca cai aqui —
  // comportamento inalterado pra esse fluxo. Mesmo padrão fail-open de
  // favorites-click-action.ts: roda depois da resposta via after(), nunca
  // atrasa nem pode impedir a abertura do WhatsApp.
  if (product.status !== "SOLD_OUT" && input.eventId && input.eventSourceUrl) {
    const eventId = input.eventId;
    const eventSourceUrl = input.eventSourceUrl;
    const trackedValue = resolveTrackingPrice(pricing);

    after(async () => {
      try {
        const [hdrs, cookieStore] = await Promise.all([headers(), cookies()]);
        await sendCapiEvent({
          eventName: "Lead",
          eventId,
          eventSourceUrl,
          userData: {
            clientIpAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim(),
            clientUserAgent: hdrs.get("user-agent") ?? undefined,
            fbp: cookieStore.get("_fbp")?.value,
            fbc: cookieStore.get("_fbc")?.value,
          },
          customData: {
            content_ids: [product.code],
            content_type: "product",
            value: trackedValue,
            currency: "BRL",
            num_items: 1,
          },
        });
      } catch {
        // sendCapiEvent já trata os próprios erros internamente; nunca deve
        // chegar aqui, mas por segurança nunca deixa nada escapar do after().
      }
    });
  }

  return { url: buildWhatsAppUrl(seller.whatsapp_number, message) };
}
