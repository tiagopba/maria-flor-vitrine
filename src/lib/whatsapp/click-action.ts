"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site";
import { buildProductWhatsAppMessage, buildSoldOutWhatsAppMessage, buildWhatsAppUrl } from "./message-builder";

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
    .select("id, name, code, slug, price, promotional_price, status")
    .eq("id", input.productId)
    .maybeSingle();

  if (productError) return { error: "Não foi possível carregar o produto." };
  if (!product || product.status === "ARCHIVED") return { error: "Produto não encontrado." };

  let seller: { id: string | null; whatsapp_number: string } | null = null;
  const selectionMode: "manual" | "round_robin" = input.sellerId ? "manual" : "round_robin";

  if (input.sellerId) {
    const { data } = await supabase
      .from("sellers")
      .select("id, whatsapp_number")
      .eq("id", input.sellerId)
      .eq("active", true)
      .maybeSingle();

    seller = data ?? null;
  } else {
    const { data: candidates } = await supabase
      .from("sellers")
      .select("id, whatsapp_number")
      .eq("active", true)
      .eq("round_robin", true)
      .order("order_priority", { ascending: true });

    if (candidates && candidates.length > 0) {
      // Distribuição simples por tempo — suficiente para o volume do MVP;
      // uma rotação mais precisa (contagem real de cliques) fica para depois.
      const index = Math.floor(Date.now() / 1000) % candidates.length;
      seller = candidates[index];
    }
  }

  // Ninguém ativa, ninguém no rodízio, ou a vendedora escolhida manualmente
  // não está mais ativa — cai no número padrão da loja em vez de deixar a
  // cliente sem opção de atendimento (NEXT_PUBLIC_WHATSAPP_DEFAULT_NUMBER).
  if (!seller) {
    const fallbackNumber = process.env.NEXT_PUBLIC_WHATSAPP_DEFAULT_NUMBER;
    if (!fallbackNumber) return { error: "Nenhuma vendedora disponível no momento." };
    seller = { id: null, whatsapp_number: fallbackNumber };
  }

  const price = product.promotional_price ?? product.price;
  const productUrl = `${getSiteUrl()}/produto/${product.slug}`;

  const message =
    product.status === "SOLD_OUT"
      ? buildSoldOutWhatsAppMessage({ productName: product.name, code: product.code })
      : buildProductWhatsAppMessage({
          productName: product.name,
          code: product.code,
          price,
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

  return { url: buildWhatsAppUrl(seller.whatsapp_number, message) };
}
