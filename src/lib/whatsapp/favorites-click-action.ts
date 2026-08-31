"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createSharedSelection } from "@/lib/db/shared-selections";
import { getSiteUrl } from "@/lib/site";
import { resolveProductPricing } from "@/lib/catalog/pricing";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import type { Database } from "@/types/database";
import { buildFavoritesWhatsAppMessage, buildWhatsAppUrl } from "./message-builder";
import { resolveSeller } from "./resolve-seller";

type AnalyticsEventInsert = Database["public"]["Tables"]["analytics_events"]["Insert"];

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
  /**
   * true = pula a criação da seleção compartilhável e manda só a lista de
   * texto — usado exclusivamente quando a cliente escolhe explicitamente
   * "Enviar somente a lista" depois de um erro em `selection_failed`.
   * Nunca acionado automaticamente.
   */
  skipSelectionLink?: boolean;
  /** Default "favorites_page" — o fluxo guiado no produto passa
   * "product_page" pra distinguir a origem no funil. */
  source?: string;
}

export type FavoritesWhatsAppResult =
  | { url: string }
  | { error: string; code?: "selection_failed" };

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
    .select("id, name, code, price, promotional_price, cash_price, max_installments_override, status")
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

  // Seleção Compartilhável: só product_id + tamanho (nunca nome/preço/foto
  // — isso a página /selecao/[token] busca ao vivo). O link de fotos é
  // parte essencial do fluxo, então uma falha aqui NÃO abre o WhatsApp
  // silenciosamente sem ele — a cliente decide explicitamente (via
  // "Tentar novamente" ou "Enviar somente a lista", skipSelectionLink)
  // como seguir. Só pulamos a criação quando ela mesma pediu isso.
  let token: string | null = null;
  if (!input.skipSelectionLink) {
    token = await createSharedSelection(
      available.map((p) => ({ product_id: p.id, selected_size: sizeByProductId.get(p.id) ?? null })),
      input.sessionId
    );

    if (!token) {
      return {
        error: "Não conseguimos preparar sua seleção agora. Tente novamente.",
        code: "selection_failed",
      };
    }
  }
  const selectionUrl = token ? `${getSiteUrl()}/selecao/${token}` : undefined;

  // Preço só é usado por buildFavoritesWhatsAppMessage quando a seleção tem
  // exatamente 1 peça (o caso real de "Quero essa peça" — ver comentário lá).
  // Resolver aqui pra cada item é barato e evita duplicar a checagem de
  // tamanho da seleção.
  const paymentSettings = await getPaymentSettings();

  const message = buildFavoritesWhatsAppMessage(
    available.map((p) => {
      const pricing = resolveProductPricing(p, paymentSettings);
      return {
        productName: p.name,
        size: sizeByProductId.get(p.id) ?? undefined,
        price: pricing.model === "legacy" ? (pricing.promotionalPrice ?? pricing.price) : undefined,
        dualPrice:
          pricing.model === "dual"
            ? { cashPrice: pricing.cashPrice, cardPrice: pricing.cardPrice, installmentCount: pricing.installmentCount }
            : undefined,
      };
    }),
    selectionUrl
  );

  const eventsToInsert: AnalyticsEventInsert[] = [
    {
      event_type: "FAVORITES_WHATSAPP_CLICK",
      session_id: input.sessionId,
      seller_id: seller.id,
      source: input.source ?? "favorites_page",
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
    },
  ];

  if (token) {
    eventsToInsert.push({
      event_type: "SELECTION_CREATED",
      session_id: input.sessionId,
      seller_id: seller.id,
      source: input.source ?? "favorites_page",
      utm_source: input.utmSource,
      utm_medium: input.utmMedium,
      utm_campaign: input.utmCampaign,
      utm_content: input.utmContent,
      referrer: input.referrer,
      metadata: { items_count: available.length },
    });
  }

  const { error: insertError } = await supabase.from("analytics_events").insert(eventsToInsert);

  if (insertError) {
    // Não bloqueia a conversa por causa de uma falha no registro do evento
    // (mesmo padrão de click-action.ts). Se FAVORITES_WHATSAPP_CLICK/
    // SELECTION_CREATED ainda não existirem na constraint do banco, é
    // exatamente isso que acontece aqui — falha logada, sem quebrar o envio.
    console.error("[submitFavoritesWhatsAppClick] falha ao registrar analytics_events:", insertError.message);
  }

  return { url: buildWhatsAppUrl(seller.whatsapp_number, message) };
}
