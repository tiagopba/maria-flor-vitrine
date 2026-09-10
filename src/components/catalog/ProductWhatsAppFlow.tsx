"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { SellerSelectionDrawer } from "@/components/catalog/SellerSelectionDrawer";
import { SingleSizeSelector } from "@/components/catalog/SingleSizeSelector";
import { recordFavoriteEvent } from "@/lib/favorites/analytics";
import { addFavorite, getFavorites, markFlowConfirmed, setSelectedSize as persistSelectedSize } from "@/lib/favorites/storage";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";
import { submitWhatsAppClick } from "@/lib/whatsapp/click-action";
import { trackAddToCart, trackPixelEvent } from "@/lib/analytics/meta-pixel";
import { sendAddToCartCapi } from "@/lib/analytics/capi-actions";
import type { ProductStatus } from "@/types/database";

/**
 * "Quero essa peça" na página de produto — adiciona a peça à MESMA
 * infraestrutura de Favoritos/Seleção usada em /favoritos (localStorage,
 * selected_size) e manda direto pra lá; toda conversa com vendedora
 * (round-robin, Lead/CAPI) acontece em /favoritos, não mais aqui. SOLD_OUT
 * é a única exceção: continua no fluxo antigo e isolado (submitWhatsAppClick),
 * porque uma peça esgotada nunca entra na seleção.
 */
export function ProductWhatsAppFlow({
  productId,
  productCode,
  productName,
  price,
  status,
  sizes,
  sellers,
}: {
  productId: string;
  /**
   * Só para o Meta Pixel (`content_ids`) — o restante do fluxo (Favoritos/
   * Seleção, localStorage, analytics interno) continua inteiramente
   * baseado em `productId`.
   */
  productCode: string;
  /** Nome e preço (já resolvido/efetivo) só para os parâmetros do AddToCart. */
  productName: string;
  price: number;
  status: ProductStatus;
  sizes: string[];
  sellers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const isSoldOut = status === "SOLD_OUT";

  // ---- Fluxo SOLD_OUT — preservado exatamente como antes desta mudança ----
  const [soldOutDrawerOpen, setSoldOutDrawerOpen] = useState(false);
  const [soldOutSubmitting, setSoldOutSubmitting] = useState<string | null>(null);
  const [soldOutError, setSoldOutError] = useState<string | null>(null);

  async function handleSoldOutSellerChoice(sellerId: string | null) {
    setSoldOutError(null);
    setSoldOutSubmitting(sellerId ?? "any");

    try {
      const utm = captureAndPersistUtm();
      const result = await submitWhatsAppClick({
        productId,
        size: null,
        sellerId,
        sessionId: getVisitorSessionId(),
        utmSource: utm.utm_source ?? null,
        utmMedium: utm.utm_medium ?? null,
        utmCampaign: utm.utm_campaign ?? null,
        utmContent: utm.utm_content ?? null,
        referrer: utm.referrer ?? null,
      });

      if ("error" in result) {
        setSoldOutError(result.error);
        setSoldOutSubmitting(null);
        return;
      }

      trackPixelEvent("Contact");
      window.location.href = result.url;
    } catch {
      setSoldOutError("Não foi possível abrir o WhatsApp. Tente novamente.");
      setSoldOutSubmitting(null);
    }
  }

  // ---- Fluxo guiado (peça disponível) ----
  const [sizeSheetOpen, setSizeSheetOpen] = useState(false);

  function trackFlowEvent(eventType: "PRODUCT_FLOW_STARTED") {
    const utm = captureAndPersistUtm();
    recordFavoriteEvent({
      eventType,
      productId,
      sessionId: getVisitorSessionId(),
      source: "product_page",
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
    }).catch(() => {});
  }

  function addToSelection(size: string | null) {
    const utm = captureAndPersistUtm();

    // Estado ANTES de mexer no storage — é a comparação contra isso que
    // decide se essa é uma mudança real da seleção (novo produto, ou
    // tamanho diferente do já salvo) ou só uma repetição idêntica/duplo
    // clique da mesma ação: só uma mudança real deve gerar um novo
    // AddToCart do Meta. addFavorite() já é idempotente pro storage, mas o
    // tracking em si não era — é isso que este guard corrige.
    //
    // `flow_confirmed` (em vez de só comparar `selected_size`) é
    // necessário porque favoritar pelo coração (AddToWishlist) já grava o
    // produto no mesmo storage, sem tamanho — sem esse marcador, a
    // primeira confirmação real de "Quero essa peça" pra um produto SEM
    // tamanho que já estava favoritado ficaria indistinguível de uma
    // repetição (null === null) e deixaria de disparar AddToCart.
    const existing = getFavorites().find((f) => f.product_id === productId);
    const wasConfirmedByFlow = existing?.flow_confirmed === true;
    const isRealChange = !wasConfirmedByFlow || (existing?.selected_size ?? null) !== size;

    addFavorite(productId);
    if (size) persistSelectedSize(productId, size);
    markFlowConfirmed(productId);

    // SIZE_SELECTED sempre que um tamanho de verdade está envolvido — tanto
    // no chip escolhido manualmente quanto no tamanho único auto-selecionado
    // (não existe UI de escolha nesse caso, mas o tamanho final é o mesmo
    // dado real; contar só o caso manual subestimaria a etapa "Escolheu
    // tamanho" do funil pros produtos de tamanho único). Peça sem nenhum
    // tamanho cadastrado (size === null) não dispara — não há o que "ter
    // escolhido".
    if (size) {
      recordFavoriteEvent({
        eventType: "SIZE_SELECTED",
        productId,
        sessionId: getVisitorSessionId(),
        source: "product_page",
        utmSource: utm.utm_source ?? null,
        utmMedium: utm.utm_medium ?? null,
        utmCampaign: utm.utm_campaign ?? null,
        utmContent: utm.utm_content ?? null,
        referrer: utm.referrer ?? null,
        metadata: { size },
      }).catch(() => {});
    }

    recordFavoriteEvent({
      eventType: "FAVORITE_ADDED",
      productId,
      sessionId: getVisitorSessionId(),
      source: "product_page",
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
      metadata: { size },
    }).catch(() => {});

    // Só dispara o Meta AddToCart (Browser + Server) quando a seleção
    // realmente mudou — repetir a mesma peça/tamanho (reclique em "Quero
    // essa peça" já adicionada, ou duplo clique físico) não gera um
    // segundo evento lógico. Mesmo momento de sempre — só o que acontece
    // DEPOIS (redirecionar pra /favoritos em vez de abrir um modal) mudou.
    if (isRealChange) {
      const eventId = crypto.randomUUID();
      trackAddToCart({ code: productCode, name: productName, price }, size, eventId);
      sendAddToCartCapi({
        eventId,
        eventSourceUrl: window.location.href,
        productCode,
        productName,
        price,
        selectedSize: size,
      }).catch(() => {});
    }

    setSizeSheetOpen(false);
    router.push("/favoritos");
  }

  function handleWantThis() {
    trackFlowEvent("PRODUCT_FLOW_STARTED");

    // Um único tamanho (ou "Único"): não faz sentido perguntar — entra
    // direto na seleção (mesma regra do SingleSizeSelector reaproveitada
    // aqui manualmente, já que não mostramos os chips nesse caso).
    if (sizes.length <= 1) {
      addToSelection(sizes[0] ?? null);
      return;
    }

    setSizeSheetOpen(true);
  }

  if (isSoldOut) {
    return (
      <div className="flex flex-col gap-3">
        <Button type="button" onClick={() => setSoldOutDrawerOpen(true)} className="h-12">
          Quero algo parecido
        </Button>

        <SellerSelectionDrawer
          open={soldOutDrawerOpen}
          onClose={() => setSoldOutDrawerOpen(false)}
          sellers={sellers}
          onChoose={handleSoldOutSellerChoice}
          submitting={soldOutSubmitting}
          error={soldOutError}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={handleWantThis} className="h-12">
        Quero essa peça
      </Button>
      <p className="text-center text-xs text-text-muted">Escolha seu tamanho e adicione às Minhas Roupas.</p>

      <Drawer open={sizeSheetOpen} onClose={() => setSizeSheetOpen(false)} title="Qual tamanho você procura?">
        <SingleSizeSelector sizes={sizes} value={null} onChange={addToSelection} label="" />
      </Drawer>
    </div>
  );
}
