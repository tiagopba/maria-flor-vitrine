"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { SellerSelectionDrawer } from "@/components/catalog/SellerSelectionDrawer";
import { SingleSizeSelector } from "@/components/catalog/SingleSizeSelector";
import { getHopsFromListing, getLastListingPath, hasInternalHistory } from "@/components/layout/NavigationTracker";
import { recordFavoriteEvent } from "@/lib/favorites/analytics";
import { markJustContactedSeller } from "@/lib/favorites/post-contact";
import { addFavorite, getFavorites, setSelectedSize as persistSelectedSize } from "@/lib/favorites/storage";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";
import { submitWhatsAppClick } from "@/lib/whatsapp/click-action";
import { submitFavoritesWhatsAppClick } from "@/lib/whatsapp/favorites-click-action";
import { trackAddToCart, trackLead, trackPixelEvent } from "@/lib/analytics/meta-pixel";
import type { ProductStatus } from "@/types/database";

/**
 * "Quero essa peça" na página de produto — não é mais um envio isolado de
 * UM produto: a peça entra na MESMA infraestrutura de Favoritos/Seleção
 * usada em /favoritos (localStorage, selected_size, seleção compartilhável,
 * escolha de vendedora, round-robin), então falar com a vendedora a partir
 * daqui manda a seleção inteira — não um sistema paralelo. SOLD_OUT é a
 * única exceção: continua no fluxo antigo e isolado (submitWhatsAppClick),
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
  const [addedSheetOpen, setAddedSheetOpen] = useState(false);
  const [needsSizeElsewhere, setNeedsSizeElsewhere] = useState(false);
  const [sellerDrawerOpen, setSellerDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [sellerError, setSellerError] = useState<string | null>(null);
  const [selectionFailed, setSelectionFailed] = useState(false);
  const [lastSellerId, setLastSellerId] = useState<string | null>(null);

  function trackFlowEvent(eventType: "PRODUCT_FLOW_STARTED" | "PRODUCT_FLOW_SEE_MORE_CLICK") {
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
    addFavorite(productId);
    if (size) persistSelectedSize(productId, size);

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

    trackAddToCart({ code: productCode, name: productName, price }, size);

    setSizeSheetOpen(false);
    setAddedSheetOpen(true);
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

  function handleSeeMoreProducts() {
    trackFlowEvent("PRODUCT_FLOW_SEE_MORE_CLICK");
    setAddedSheetOpen(false);

    // Produto e tamanho já estão salvos no localStorage — só navega.
    //
    // "Voltar pra origem" precisa ser a página de listagem de onde a
    // cliente realmente veio (Novidades/Categoria/Busca com filtros) —
    // nunca a Home por padrão, e nunca uma cor diferente da que ela clicou
    // originalmente (trocar de cor pelo slider usa history.replaceState,
    // que não conta como "pulo" aqui — ver NavigationTracker).
    //
    // router.back() é preferido quando ainda estamos na MESMA página de
    // produto que a cliente abriu a partir da listagem (0 pulos): o Next
    // restaura a posição/scroll exata da listagem, sem recarregar. Se ela
    // navegou manualmente entre peças/cores (clique real em link) antes de
    // adicionar à seleção, back() só desfaria um desses cliques — nesse
    // caso usamos a URL da listagem guardada diretamente.
    if (hasInternalHistory() && getHopsFromListing() === 0) {
      router.back();
      return;
    }

    router.push(getLastListingPath() ?? "/novidades");
  }

  function handleTalkToSeller() {
    // Sem buscar os produtos de cada item não dá pra saber com certeza se
    // ele PRECISA de tamanho — em vez de duplicar essa checagem (que já
    // existe em /favoritos, com os dados completos), qualquer item sem
    // selected_size manda a cliente terminar lá, reaproveitando a
    // validação existente em vez de reimplementá-la.
    const favorites = getFavorites();
    const hasIncompleteItem = favorites.length > 1 && favorites.some((f) => !f.selected_size);

    if (hasIncompleteItem) {
      setAddedSheetOpen(false);
      setNeedsSizeElsewhere(true);
      return;
    }

    setNeedsSizeElsewhere(false);
    setSellerError(null);
    setSelectionFailed(false);
    setSellerDrawerOpen(true);
  }

  async function handleSellerChoice(sellerId: string | null, skipSelectionLink = false) {
    setSellerError(null);
    setSelectionFailed(false);
    setLastSellerId(sellerId);
    setSubmitting(sellerId ?? "any");

    // Sempre a seleção inteira (não só esta peça) — se só existir esta,
    // items terá 1 elemento; reaproveita submitFavoritesWhatsAppClick
    // integralmente, o mesmo caminho de /favoritos.
    const items = getFavorites().map((f) => ({ productId: f.product_id, size: f.selected_size ?? null }));

    // Um único id pros dois lados do Lead (Pixel do browser + Conversions
    // API) — é isso que permite a Meta reconhecer as duas chamadas como um
    // único evento em vez de contar duas conversões.
    const eventId = crypto.randomUUID();

    try {
      const utm = captureAndPersistUtm();
      const result = await submitFavoritesWhatsAppClick({
        items,
        sellerId,
        sessionId: getVisitorSessionId(),
        source: "product_page",
        utmSource: utm.utm_source ?? null,
        utmMedium: utm.utm_medium ?? null,
        utmCampaign: utm.utm_campaign ?? null,
        utmContent: utm.utm_content ?? null,
        referrer: utm.referrer ?? null,
        skipSelectionLink,
        eventId,
        eventSourceUrl: window.location.href,
      });

      if ("error" in result) {
        setSellerError(result.error);
        setSelectionFailed(result.code === "selection_failed");
        setSubmitting(null);
        return;
      }

      markJustContactedSeller();
      trackLead(result.leadData, eventId);
      window.location.href = result.url;
    } catch {
      setSellerError("Não foi possível abrir o WhatsApp. Tente novamente.");
      setSelectionFailed(false);
      setSubmitting(null);
    }
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

      {needsSizeElsewhere && (
        <p className="text-xs text-red-600">
          Escolha o tamanho das peças antes de enviar sua seleção.{" "}
          <Link href="/favoritos" className="underline">
            Ver em Minha Seleção
          </Link>
        </p>
      )}

      <Drawer open={sizeSheetOpen} onClose={() => setSizeSheetOpen(false)} title="Qual tamanho você procura?">
        <SingleSizeSelector sizes={sizes} value={null} onChange={addToSelection} label="" />
      </Drawer>

      <Drawer open={addedSheetOpen} onClose={() => setAddedSheetOpen(false)}>
        <div className="flex flex-col items-center gap-1 pb-1 text-center">
          <p className="font-display text-lg text-text">Peça adicionada à sua seleção ❤️</p>
          <p className="mb-2 text-sm text-text-muted">Quer escolher mais alguma peça?</p>

          <Button type="button" onClick={handleTalkToSeller} className="h-12 w-full">
            Falar com uma vendedora
          </Button>
          <Button type="button" variant="secondary" onClick={handleSeeMoreProducts} className="h-12 w-full">
            Ver mais peças
          </Button>
        </div>
      </Drawer>

      <SellerSelectionDrawer
        open={sellerDrawerOpen}
        onClose={() => setSellerDrawerOpen(false)}
        sellers={sellers}
        onChoose={(sellerId) => handleSellerChoice(sellerId)}
        submitting={submitting}
        error={sellerError}
        errorActions={
          selectionFailed
            ? [
                { label: "Tentar novamente", onClick: () => handleSellerChoice(lastSellerId) },
                { label: "Enviar somente a lista", onClick: () => handleSellerChoice(lastSellerId, true) },
              ]
            : undefined
        }
      />
    </div>
  );
}
